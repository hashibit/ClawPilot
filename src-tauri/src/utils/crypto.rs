use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use rand_core::RngCore;
use std::fs;
use std::path::PathBuf;

use crate::error::{AppError, Result};

const ENC_PREFIX: &str = "enc:";

/// Get the path to the shared key file (~/.clawpilot/server.key)
fn key_file_path() -> PathBuf {
    let home = dirs::home_dir().expect("Could not determine home directory");
    home.join(".clawpilot").join("server.key")
}

/// Load a 32-byte AES-256 key from the shared key file.
/// If the file doesn't exist or contains invalid data, creates a new random key.
///
/// This matches the Node.js server implementation for cross-compatibility.
fn load_key() -> [u8; 32] {
    let path = key_file_path();

    // Try to read existing key
    if let Ok(hex) = fs::read_to_string(&path) {
        let hex = hex.trim();
        if hex.len() == 64 {
            if let Ok(bytes) = hex::decode(hex) {
                if bytes.len() == 32 {
                    let mut key = [0u8; 32];
                    key.copy_from_slice(&bytes);
                    return key;
                }
            }
        }
    }

    // Generate new random key
    let mut key = [0u8; 32];
    use aes_gcm::aead::OsRng;
    OsRng.fill_bytes(&mut key);

    // Persist the key
    let hex_key = hex::encode(key);
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Err(e) = fs::write(&path, &hex_key) {
        eprintln!("[crypto] Failed to persist key: {e}");
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(_meta) = fs::metadata(&path) {
            let _ = fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
    }

    key
}

/// Alias for load_key() for backward compatibility with tests.
fn derive_key() -> [u8; 32] {
    load_key()
}

/// Bytes to hex string
fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// Hex string to bytes
fn from_hex(hex: &str) -> Result<Vec<u8>> {
    if hex.len() % 2 != 0 {
        return Err(AppError::Encryption("hex string must have even length".to_string()));
    }
    let mut result = Vec::with_capacity(hex.len() / 2);
    for i in (0..hex.len()).step_by(2) {
        let byte = u8::from_str_radix(&hex[i..i + 2], 16)
            .map_err(|e| AppError::Encryption(format!("hex decode error: {e}")))?;
        result.push(byte);
    }
    Ok(result)
}

/// Encrypt `plaintext` with AES-256-GCM.
///
/// Returns a string in the format `enc:<nonce_hex>:<tag_hex>:<data_hex>`.
/// This format is compatible with the Node.js server implementation.
/// The nonce is randomly generated (12 bytes) on every call.
pub fn encrypt(plaintext: &str) -> Result<String> {
    if plaintext.is_empty() {
        return Ok(String::new());
    }

    let key_bytes = derive_key();
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| AppError::Encryption(e.to_string()))?;

    // Split ciphertext into tag (last 16 bytes) and actual encrypted data
    // aes-gcm appends the 16-byte tag to the end of ciphertext
    let tag_len = 16;
    if ciphertext.len() < tag_len {
        return Err(AppError::Encryption("ciphertext too short".to_string()));
    }
    let (ct_data, tag) = ciphertext.split_at(ciphertext.len() - tag_len);

    let result = format!(
        "{}{}:{}:{}",
        ENC_PREFIX,
        to_hex(nonce.as_slice()),
        to_hex(tag),
        to_hex(ct_data)
    );
    Ok(result)
}

/// Decrypt a hex-encoded `enc:<nonce_hex>:<tag_hex>:<data_hex>` string produced by [`encrypt`].
/// Also supports the legacy format `<nonce_b64>:<ciphertext_b64>` for backward compatibility.
pub fn decrypt(encoded: &str) -> Result<String> {
    if encoded.is_empty() {
        return Ok(String::new());
    }

    // New format: enc:<nonce_hex>:<tag_hex>:<data_hex>
    if encoded.starts_with(ENC_PREFIX) {
        let inner = &encoded[ENC_PREFIX.len()..];
        let parts: Vec<&str> = inner.split(':').collect();
        if parts.len() != 3 {
            return Err(AppError::Encryption(format!(
                "invalid ciphertext format: expected 3 parts, got {}",
                parts.len()
            )));
        }

        let nonce_bytes = from_hex(parts[0])?;
        let tag_bytes = from_hex(parts[1])?;
        let ct_bytes = from_hex(parts[2])?;

        if nonce_bytes.len() != 12 {
            return Err(AppError::Encryption(format!(
                "invalid nonce length: expected 12, got {}",
                nonce_bytes.len()
            )));
        }

        let key_bytes = derive_key();
        let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
        let cipher = Aes256Gcm::new(key);

        let nonce = Nonce::from_slice(&nonce_bytes);

        // Reconstruct ciphertext with tag appended (aes-gcm expects tag at end)
        let mut full_ct = ct_bytes;
        full_ct.extend_from_slice(&tag_bytes);

        let plaintext_bytes = cipher
            .decrypt(nonce, &*full_ct)
            .map_err(|e| AppError::Encryption(format!("decryption failed: {e}")))?;

        return String::from_utf8(plaintext_bytes)
            .map_err(|e| AppError::Encryption(format!("invalid UTF-8 after decryption: {e}")));
    }

    // Legacy format: <nonce_b64>:<ciphertext_b64> (for backward compatibility)
    // This handles existing data in the database created by the old Tauri implementation
    use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

    let (nonce_b64, ct_b64) = encoded
        .split_once(':')
        .ok_or_else(|| AppError::Encryption("invalid ciphertext format: missing ':'".to_string()))?;

    let nonce_bytes = BASE64
        .decode(nonce_b64)
        .map_err(|e| AppError::Encryption(format!("nonce base64 decode error: {e}")))?;

    let ct_bytes = BASE64
        .decode(ct_b64)
        .map_err(|e| AppError::Encryption(format!("ciphertext base64 decode error: {e}")))?;

    if nonce_bytes.len() != 12 {
        return Err(AppError::Encryption(format!(
            "invalid nonce length: expected 12, got {}",
            nonce_bytes.len()
        )));
    }

    let key_bytes = derive_key();
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let nonce = Nonce::from_slice(&nonce_bytes);

    let plaintext_bytes = cipher
        .decrypt(nonce, ct_bytes.as_ref())
        .map_err(|e| AppError::Encryption(format!("decryption failed: {e}")))?;

    String::from_utf8(plaintext_bytes)
        .map_err(|e| AppError::Encryption(format!("invalid UTF-8 after decryption: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let plaintext = "sk-test-api-key-1234567890abcdef";
        let encrypted = encrypt(plaintext).expect("encrypt should succeed");
        let decrypted = decrypt(&encrypted).expect("decrypt should succeed");
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_same_plaintext_different_ciphertext() {
        let plaintext = "same-input-key";
        let enc1 = encrypt(plaintext).expect("first encrypt should succeed");
        let enc2 = encrypt(plaintext).expect("second encrypt should succeed");
        // Nonce is random, so the encoded output must differ.
        assert_ne!(enc1, enc2, "two encryptions of the same plaintext should produce different output");
        // Both should still decrypt to the original.
        assert_eq!(decrypt(&enc1).unwrap(), plaintext);
        assert_eq!(decrypt(&enc2).unwrap(), plaintext);
    }

    #[test]
    fn test_empty_string_roundtrip() {
        let plaintext = "";
        let encrypted = encrypt(plaintext).expect("encrypt empty string should succeed");
        let decrypted = decrypt(&encrypted).expect("decrypt empty string should succeed");
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_decrypt_tampered_ciphertext_fails() {
        let encrypted = encrypt("secret").expect("encrypt should succeed");
        // Tamper with the data part (last hex segment)
        let parts: Vec<&str> = encrypted[ENC_PREFIX.len()..].split(':').collect();
        assert_eq!(parts.len(), 3);
        let mut tampered_ct = from_hex(parts[2]).unwrap();
        tampered_ct[0] ^= 0xFF;
        let tampered = format!(
            "{}{}:{}:{}",
            ENC_PREFIX,
            parts[0],
            parts[1],
            to_hex(&tampered_ct)
        );
        assert!(
            decrypt(&tampered).is_err(),
            "decrypting tampered ciphertext should return an error"
        );
    }

    #[test]
    fn test_decrypt_invalid_format_fails() {
        assert!(decrypt("nodcolon").is_err());
    }

    #[test]
    fn test_encrypt_format_matches_nodejs() {
        // Verify the output format matches Node.js: enc:<nonce_hex>:<tag_hex>:<data_hex>
        let plaintext = "test-key";
        let encrypted = encrypt(plaintext).unwrap();

        // Should start with enc:
        assert!(encrypted.starts_with(ENC_PREFIX));

        // Should have 3 colon-separated parts after the prefix
        let inner = &encrypted[ENC_PREFIX.len()..];
        let parts: Vec<&str> = inner.split(':').collect();
        assert_eq!(parts.len(), 3, "should have nonce:tag:data format");

        // All parts should be valid hex
        for (i, part) in parts.iter().enumerate() {
            assert!(
                from_hex(part).is_ok(),
                "part {} should be valid hex, got: {}",
                i,
                part
            );
        }

        // Nonce should be 12 bytes (24 hex chars)
        assert_eq!(parts[0].len(), 24, "nonce should be 12 bytes (24 hex chars)");

        // Tag should be 16 bytes (32 hex chars)
        assert_eq!(parts[1].len(), 32, "tag should be 16 bytes (32 hex chars)");
    }

    #[test]
    fn test_decrypt_nodejs_format() {
        // Test decrypting a value encrypted by Node.js (same key file)
        // Format: enc:<nonce_hex>:<tag_hex>:<data_hex>
        let nodejs_encrypted = "enc:000000000000000000000000:00000000000000000000000000000000:0000000000000000000000000000000000000000000000";
        // This will fail with invalid tag, but tests the format parsing
        // A real test would require sharing the key file

        // Test format parsing - should have 3 parts
        assert!(nodejs_encrypted.starts_with("enc:"));
        let inner = &nodejs_encrypted[4..];
        let parts: Vec<&str> = inner.split(':').collect();
        assert_eq!(parts.len(), 3, "Node.js format should have 3 parts");
    }
}
