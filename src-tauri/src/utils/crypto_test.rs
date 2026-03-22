/// crypto_test.rs
/// 加密工具单元测试
#[cfg(test)]
mod tests {
    use crate::utils::crypto;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let original = "sk-test-api-key-12345-abcde";
        let encrypted = crypto::encrypt(original).unwrap();
        let decrypted = crypto::decrypt(&encrypted).unwrap();
        
        assert_eq!(decrypted, original);
    }

    #[test]
    fn test_encrypt_produces_different_ciphertexts() {
        // AES-GCM 每次加密应产生不同密文（随机 nonce）
        let key = "same-secret-key";
        let c1 = crypto::encrypt(key).unwrap();
        let c2 = crypto::encrypt(key).unwrap();
        
        assert_ne!(c1, c2, "相同明文每次加密应产生不同密文");
    }

    #[test]
    fn test_encrypt_changes_text() {
        let original = "test-key";
        let encrypted = crypto::encrypt(original).unwrap();
        
        assert_ne!(encrypted, original, "加密后密文不应等于明文");
    }

    #[test]
    fn test_decrypt_invalid_data() {
        let invalid_data = "not-valid-base64!@#$";
        let result = crypto::decrypt(invalid_data);
        
        assert!(result.is_err(), "解密无效数据应返回错误");
    }

    #[test]
    fn test_decrypt_empty_string() {
        let result = crypto::decrypt("");
        assert!(result.is_err(), "解密空字符串应返回错误");
    }

    #[test]
    fn test_encrypt_empty_string() {
        let original = "";
        let encrypted = crypto::encrypt(original).unwrap();
        let decrypted = crypto::decrypt(&encrypted).unwrap();
        
        assert_eq!(decrypted, original);
    }

    #[test]
    fn test_encrypt_long_string() {
        let original = "sk-".repeat(1000); // 长密钥
        let encrypted = crypto::encrypt(&original).unwrap();
        let decrypted = crypto::decrypt(&encrypted).unwrap();
        
        assert_eq!(decrypted, original);
    }

    #[test]
    fn test_encrypt_special_characters() {
        let original = "sk-test!@#$%^&*()_+-=[]{}|;':\",./<>?";
        let encrypted = crypto::encrypt(original).unwrap();
        let decrypted = crypto::decrypt(&encrypted).unwrap();
        
        assert_eq!(decrypted, original);
    }

    #[test]
    fn test_encrypt_unicode() {
        let original = "密钥 - 🔑-🔒-🔓";
        let encrypted = crypto::encrypt(original).unwrap();
        let decrypted = crypto::decrypt(&encrypted).unwrap();
        
        assert_eq!(decrypted, original);
    }
}
