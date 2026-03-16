use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Key, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};

use crate::error::{AppError, Result};

/// Derive a 32-byte AES-256 key from a byte slice.
///
/// Fills a 32-byte array by cycling through `source` bytes.
/// When `source` is at least 32 bytes this effectively takes the first 32 bytes;
/// shorter values are repeated to fill the array (poor-man's stretch that avoids
/// pulling in an extra crate).
fn stretch_to_32(source: &[u8]) -> [u8; 32] {
    let mut key = [0u8; 32];
    if source.is_empty() {
        return key;
    }
    for (i, byte) in key.iter_mut().enumerate() {
        *byte = source[i % source.len()];
    }
    key
}

/// Derive a 32-byte AES-256 key.
///
/// Priority:
/// 1. Environment variable `CLAWPILOT_SECRET_KEY`
/// 2. Fixed compile-time seed (stable fallback when no env var is set)
fn derive_key() -> [u8; 32] {
    if let Ok(secret) = std::env::var("CLAWPILOT_SECRET_KEY") {
        stretch_to_32(secret.as_bytes())
    } else {
        // Fallback: deterministic seed so the key is stable across runs.
        stretch_to_32(b"clawpilot-default-machine-key-v1")
    }
}

/// Encrypt `plaintext` with AES-256-GCM.
///
/// Returns a base64-encoded string in the format `<nonce_b64>:<ciphertext_b64>`.
/// The nonce is randomly generated (12 bytes) on every call.
pub fn encrypt(plaintext: &str) -> Result<String> {
    let key_bytes = derive_key();
    let key = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| AppError::Encryption(e.to_string()))?;

    let result = format!(
        "{}:{}",
        BASE64.encode(nonce.as_slice()),
        BASE64.encode(&ciphertext)
    );
    Ok(result)
}

/// Decrypt a base64-encoded `<nonce_b64>:<ciphertext_b64>` string produced by [`encrypt`].
pub fn decrypt(encoded: &str) -> Result<String> {
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
        // Flip a byte in the ciphertext part.
        let (nonce_b64, ct_b64) = encrypted.split_once(':').unwrap();
        let mut ct_bytes = BASE64.decode(ct_b64).unwrap();
        ct_bytes[0] ^= 0xFF;
        let tampered = format!("{}:{}", nonce_b64, BASE64.encode(&ct_bytes));
        assert!(
            decrypt(&tampered).is_err(),
            "decrypting tampered ciphertext should return an error"
        );
    }

    #[test]
    fn test_decrypt_invalid_format_fails() {
        assert!(decrypt("nodcolon").is_err());
    }
}
