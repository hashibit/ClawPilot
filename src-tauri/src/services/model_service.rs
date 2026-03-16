use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::model::{ModelInfo, ProviderConfig, ProviderType};
use crate::utils::crypto;

/// 全プロバイダー設定を取得する。
///
/// api_key は DB から取得後に復号して返す。
pub fn get_providers(pool: &DbPool) -> Result<Vec<ProviderConfig>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, provider_type, api_key, endpoint, is_enabled, is_available, \
         last_tested, created_at, updated_at \
         FROM model_providers \
         ORDER BY created_at ASC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, Option<String>>(3)?,
            row.get::<_, i64>(4)?,
            row.get::<_, i64>(5)?,
            row.get::<_, Option<i64>>(6)?,
            row.get::<_, i64>(7)?,
            row.get::<_, i64>(8)?,
        ))
    })?;

    let mut providers = Vec::new();
    for row in rows {
        let (db_id, provider_type_str, api_key_enc, endpoint, is_enabled_i64,
             is_available_i64, last_tested, created_at, updated_at) = row?;

        let provider_type = ProviderType::from_str(&provider_type_str).ok_or_else(|| {
            AppError::Internal(format!("unknown provider_type: {provider_type_str}"))
        })?;

        // api_key が空文字ならば None として扱う
        let api_key = if api_key_enc.is_empty() {
            None
        } else {
            Some(crypto::decrypt(&api_key_enc)?)
        };

        providers.push(ProviderConfig {
            id: db_id.to_string(),
            provider_type,
            api_key,
            endpoint,
            is_enabled: ProviderConfig::i64_to_bool(is_enabled_i64),
            is_available: ProviderConfig::i64_to_bool(is_available_i64),
            last_tested,
            created_at,
            updated_at,
        });
    }

    Ok(providers)
}

/// 指定の provider_type に対応するプロバイダー設定を取得する。
///
/// api_key は復号して返す。
pub fn get_provider(pool: &DbPool, provider_type: &str) -> Result<ProviderConfig> {
    let conn = pool.get()?;
    let result = conn.query_row(
        "SELECT id, provider_type, api_key, endpoint, is_enabled, is_available, \
         last_tested, created_at, updated_at \
         FROM model_providers \
         WHERE provider_type = ?1",
        [provider_type],
        |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, Option<i64>>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, i64>(8)?,
            ))
        },
    );

    match result {
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            Err(AppError::NotFound(format!("provider not found: {provider_type}")))
        }
        Err(e) => Err(AppError::Database(e)),
        Ok((db_id, provider_type_str, api_key_enc, endpoint, is_enabled_i64,
            is_available_i64, last_tested, created_at, updated_at)) => {
            let pt = ProviderType::from_str(&provider_type_str).ok_or_else(|| {
                AppError::Internal(format!("unknown provider_type: {provider_type_str}"))
            })?;

            let api_key = if api_key_enc.is_empty() {
                None
            } else {
                Some(crypto::decrypt(&api_key_enc)?)
            };

            Ok(ProviderConfig {
                id: db_id.to_string(),
                provider_type: pt,
                api_key,
                endpoint,
                is_enabled: ProviderConfig::i64_to_bool(is_enabled_i64),
                is_available: ProviderConfig::i64_to_bool(is_available_i64),
                last_tested,
                created_at,
                updated_at,
            })
        }
    }
}

/// プロバイダー設定を挿入または更新する（INSERT OR REPLACE）。
///
/// api_key は暗号化してから DB に保存する。
pub fn upsert_provider(pool: &DbPool, config: ProviderConfig) -> Result<()> {
    let api_key_enc = match &config.api_key {
        Some(key) if !key.is_empty() => crypto::encrypt(key)?,
        _ => String::new(),
    };

    let conn = pool.get()?;
    conn.execute(
        "INSERT INTO model_providers \
             (provider_type, api_key, endpoint, is_enabled, is_available, \
              last_tested, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) \
         ON CONFLICT(provider_type) DO UPDATE SET \
             api_key      = excluded.api_key, \
             endpoint     = excluded.endpoint, \
             is_enabled   = excluded.is_enabled, \
             is_available = excluded.is_available, \
             last_tested  = excluded.last_tested, \
             updated_at   = excluded.updated_at",
        rusqlite::params![
            config.provider_type.as_str(),
            api_key_enc,
            config.endpoint,
            ProviderConfig::bool_to_i64(config.is_enabled),
            ProviderConfig::bool_to_i64(config.is_available),
            config.last_tested,
            config.created_at,
            config.updated_at,
        ],
    )?;

    Ok(())
}

/// 全モデル情報を取得する。
pub fn get_models(pool: &DbPool) -> Result<Vec<ModelInfo>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, display_name, provider_type, context_window, \
         input_price, output_price, supports_vision, supports_function_calling, \
         supports_streaming \
         FROM model_info \
         ORDER BY provider_type, name ASC",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i32>(4)?,
            row.get::<_, f64>(5)?,
            row.get::<_, f64>(6)?,
            row.get::<_, i64>(7)?,
            row.get::<_, i64>(8)?,
            row.get::<_, i64>(9)?,
        ))
    })?;

    let mut models = Vec::new();
    for row in rows {
        let (db_id, name, display_name, provider_type_str, context_window,
             input_price, output_price, supports_vision_i64,
             supports_function_calling_i64, supports_streaming_i64) = row?;

        let provider_type = ProviderType::from_str(&provider_type_str).ok_or_else(|| {
            AppError::Internal(format!("unknown provider_type: {provider_type_str}"))
        })?;

        models.push(ModelInfo {
            id: db_id.to_string(),
            name,
            display_name,
            provider_type,
            context_window,
            input_price,
            output_price,
            supports_vision: ModelInfo::i64_to_bool(supports_vision_i64),
            supports_function_calling: ModelInfo::i64_to_bool(supports_function_calling_i64),
            supports_streaming: ModelInfo::i64_to_bool(supports_streaming_i64),
        });
    }

    Ok(models)
}

/// モデル情報を一括挿入または更新する（INSERT OR REPLACE）。
///
/// `name` に UNIQUE 制約があるため既存レコードは上書きされる。
pub fn upsert_models(pool: &DbPool, models: Vec<ModelInfo>) -> Result<()> {
    let conn = pool.get()?;

    // now_ts を現在時刻として利用（utils::time が未実装のため直接取得）
    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    for model in models {
        conn.execute(
            "INSERT INTO model_info \
                 (name, display_name, provider_type, context_window, input_price, \
                  output_price, supports_vision, supports_function_calling, \
                  supports_streaming, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) \
             ON CONFLICT(name) DO UPDATE SET \
                 display_name               = excluded.display_name, \
                 provider_type              = excluded.provider_type, \
                 context_window             = excluded.context_window, \
                 input_price                = excluded.input_price, \
                 output_price               = excluded.output_price, \
                 supports_vision            = excluded.supports_vision, \
                 supports_function_calling  = excluded.supports_function_calling, \
                 supports_streaming         = excluded.supports_streaming, \
                 updated_at                 = excluded.updated_at",
            rusqlite::params![
                model.name,
                model.display_name,
                model.provider_type.as_str(),
                model.context_window,
                model.input_price,
                model.output_price,
                ModelInfo::bool_to_i64(model.supports_vision),
                ModelInfo::bool_to_i64(model.supports_function_calling),
                ModelInfo::bool_to_i64(model.supports_streaming),
                now_ts,
            ],
        )?;
    }

    Ok(())
}

/// プロバイダーの接続テストを行う（現時点では HTTP 呼び出しなし）。
///
/// - `is_enabled` が true かつ `api_key` が非空であれば `true` を返す。
/// - テスト実行後に `last_tested` と `is_available` を更新する。
pub fn test_provider(pool: &DbPool, provider_type: &str) -> Result<bool> {
    let config = get_provider(pool, provider_type)?;

    let is_ok = config.is_enabled && config.api_key.as_deref().map_or(false, |k| !k.is_empty());

    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let conn = pool.get()?;
    conn.execute(
        "UPDATE model_providers \
         SET last_tested = ?1, is_available = ?2, updated_at = ?3 \
         WHERE provider_type = ?4",
        rusqlite::params![
            now_ts,
            ProviderConfig::bool_to_i64(is_ok),
            now_ts,
            provider_type,
        ],
    )?;

    Ok(is_ok)
}

// ─────────────────────────────────────────────
// テスト用ヘルパー
// ─────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::pool::DbPool;
    use crate::database::schema::SCHEMA_V1;
    use rusqlite::Connection;

    fn setup_pool() -> DbPool {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA synchronous=NORMAL;",
        )
        .expect("configure pragmas");
        conn.execute_batch(SCHEMA_V1).expect("apply schema");
        DbPool::new_in_memory_for_test(conn)
    }

    fn make_provider(provider_type: ProviderType, api_key: Option<&str>) -> ProviderConfig {
        let now = 1700000000i64;
        ProviderConfig {
            id: String::new(), // DB が採番するため空で OK
            provider_type,
            api_key: api_key.map(|s| s.to_string()),
            endpoint: None,
            is_enabled: true,
            is_available: false,
            last_tested: None,
            created_at: now,
            updated_at: now,
        }
    }

    fn make_model(name: &str, provider_type: ProviderType) -> ModelInfo {
        ModelInfo {
            id: String::new(),
            name: name.to_string(),
            display_name: format!("{name} Display"),
            provider_type,
            context_window: 8192,
            input_price: 0.01,
            output_price: 0.02,
            supports_vision: false,
            supports_function_calling: true,
            supports_streaming: true,
        }
    }

    // ─── ProviderConfig CRUD ───────────────────────────────────────────────

    #[test]
    fn test_upsert_and_get_provider() {
        let pool = setup_pool();
        let config = make_provider(ProviderType::Bailian, Some("test-api-key"));

        upsert_provider(&pool, config.clone()).expect("upsert should succeed");

        let fetched = get_provider(&pool, "BAILIAN").expect("get_provider should succeed");
        assert_eq!(fetched.provider_type, ProviderType::Bailian);
        assert_eq!(fetched.api_key.as_deref(), Some("test-api-key"));
        assert!(fetched.is_enabled);
    }

    #[test]
    fn test_get_provider_not_found() {
        let pool = setup_pool();
        let err = get_provider(&pool, "NONEXISTENT").expect_err("should return error");
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn test_upsert_provider_updates_existing() {
        let pool = setup_pool();
        let mut config = make_provider(ProviderType::Volcengine, Some("old-key"));
        upsert_provider(&pool, config.clone()).expect("first upsert should succeed");

        config.api_key = Some("new-key".to_string());
        config.is_enabled = false;
        upsert_provider(&pool, config).expect("second upsert should succeed");

        let fetched = get_provider(&pool, "VOLCENGINE").expect("get_provider should succeed");
        assert_eq!(fetched.api_key.as_deref(), Some("new-key"));
        assert!(!fetched.is_enabled);
    }

    #[test]
    fn test_get_providers_returns_all() {
        let pool = setup_pool();
        upsert_provider(&pool, make_provider(ProviderType::Bailian, Some("key-a")))
            .expect("upsert bailian");
        upsert_provider(&pool, make_provider(ProviderType::Minimax, Some("key-b")))
            .expect("upsert minimax");

        let providers = get_providers(&pool).expect("get_providers should succeed");
        assert_eq!(providers.len(), 2);
    }

    #[test]
    fn test_api_key_encrypted_in_db() {
        let pool = setup_pool();
        let plaintext_key = "my-secret-api-key";
        upsert_provider(&pool, make_provider(ProviderType::Bailian, Some(plaintext_key)))
            .expect("upsert should succeed");

        // DB から生の値を取得して、平文がそのまま保存されていないことを確認する
        let conn = pool.get().expect("get conn");
        let raw_key: String = conn
            .query_row(
                "SELECT api_key FROM model_providers WHERE provider_type = 'BAILIAN'",
                [],
                |row| row.get(0),
            )
            .expect("query raw key");

        assert_ne!(raw_key, plaintext_key, "api_key must not be stored in plaintext");

        // サービス経由で取得すると復号されていること
        drop(conn); // MutexGuard を解放
        let fetched = get_provider(&pool, "BAILIAN").expect("get_provider should succeed");
        assert_eq!(fetched.api_key.as_deref(), Some(plaintext_key));
    }

    // ─── ModelInfo CRUD ────────────────────────────────────────────────────

    #[test]
    fn test_upsert_and_get_models() {
        let pool = setup_pool();
        // provider_type 外部キー制約を満たすため先にプロバイダーを登録
        upsert_provider(&pool, make_provider(ProviderType::Bailian, Some("key")))
            .expect("upsert provider");

        let models = vec![
            make_model("qwen-max", ProviderType::Bailian),
            make_model("qwen-plus", ProviderType::Bailian),
        ];
        upsert_models(&pool, models).expect("upsert_models should succeed");

        let fetched = get_models(&pool).expect("get_models should succeed");
        assert_eq!(fetched.len(), 2);
        let names: Vec<&str> = fetched.iter().map(|m| m.name.as_str()).collect();
        assert!(names.contains(&"qwen-max"));
        assert!(names.contains(&"qwen-plus"));
    }

    #[test]
    fn test_upsert_models_updates_existing() {
        let pool = setup_pool();
        upsert_provider(&pool, make_provider(ProviderType::Bailian, Some("key")))
            .expect("upsert provider");

        let mut model = make_model("qwen-max", ProviderType::Bailian);
        upsert_models(&pool, vec![model.clone()]).expect("first upsert");

        model.context_window = 32768;
        upsert_models(&pool, vec![model]).expect("second upsert");

        let fetched = get_models(&pool).expect("get_models should succeed");
        assert_eq!(fetched.len(), 1);
        assert_eq!(fetched[0].context_window, 32768);
    }

    // ─── test_provider ──────────────────────────────────────────────────────

    #[test]
    fn test_provider_with_api_key_returns_true() {
        let pool = setup_pool();
        upsert_provider(&pool, make_provider(ProviderType::Bailian, Some("my-key")))
            .expect("upsert provider");

        let result = test_provider(&pool, "BAILIAN").expect("test_provider should succeed");
        assert!(result);

        // last_tested が更新されていること
        let updated = get_provider(&pool, "BAILIAN").expect("get_provider");
        assert!(updated.last_tested.is_some());
        assert!(updated.is_available);
    }

    #[test]
    fn test_provider_without_api_key_returns_false() {
        let pool = setup_pool();
        upsert_provider(&pool, make_provider(ProviderType::Minimax, None))
            .expect("upsert provider");

        let result = test_provider(&pool, "MINIMAX").expect("test_provider should succeed");
        assert!(!result);

        let updated = get_provider(&pool, "MINIMAX").expect("get_provider");
        assert!(!updated.is_available);
    }

    #[test]
    fn test_provider_disabled_returns_false() {
        let pool = setup_pool();
        let mut config = make_provider(ProviderType::Volcengine, Some("key"));
        config.is_enabled = false;
        upsert_provider(&pool, config).expect("upsert provider");

        let result = test_provider(&pool, "VOLCENGINE").expect("test_provider should succeed");
        assert!(!result);
    }
}
