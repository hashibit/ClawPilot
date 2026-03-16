use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::channel::{ChannelConfig, ChannelType, FeishuConfig};

/// 指定 OPC に属する全チャンネル設定を取得する。
pub fn get_channels(pool: &DbPool, opc_id: &str) -> Result<Vec<ChannelConfig>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, opc_id, channel_type, is_enabled, feishu_config, \
         is_connected, last_connected, created_at, updated_at \
         FROM channels \
         WHERE opc_id = ?1 \
         ORDER BY created_at ASC",
    )?;

    let rows = stmt.query_map([opc_id], |row| {
        Ok((
            row.get::<_, i64>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, i64>(3)?,
            row.get::<_, Option<String>>(4)?,
            row.get::<_, i64>(5)?,
            row.get::<_, Option<i64>>(6)?,
            row.get::<_, i64>(7)?,
            row.get::<_, i64>(8)?,
        ))
    })?;

    let mut channels = Vec::new();
    for row in rows {
        let (db_id, opc_id_val, channel_type_str, is_enabled_i64, feishu_config_json,
             is_connected_i64, last_connected, created_at, updated_at) = row?;

        let channel_type = ChannelType::from_str(&channel_type_str).ok_or_else(|| {
            AppError::Internal(format!("unknown channel_type: {channel_type_str}"))
        })?;

        let feishu_config = feishu_config_json
            .as_deref()
            .and_then(ChannelConfig::feishu_config_from_json);

        channels.push(ChannelConfig {
            id: db_id.to_string(),
            opc_id: opc_id_val,
            channel_type,
            is_enabled: ChannelConfig::i64_to_bool(is_enabled_i64),
            feishu_config,
            is_connected: ChannelConfig::i64_to_bool(is_connected_i64),
            last_connected,
            created_at,
            updated_at,
        });
    }

    Ok(channels)
}

/// 指定 ID のチャンネル設定を取得する。
pub fn get_channel(pool: &DbPool, id: i64) -> Result<ChannelConfig> {
    let conn = pool.get()?;
    let result = conn.query_row(
        "SELECT id, opc_id, channel_type, is_enabled, feishu_config, \
         is_connected, last_connected, created_at, updated_at \
         FROM channels \
         WHERE id = ?1",
        [id],
        |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, Option<i64>>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, i64>(8)?,
            ))
        },
    );

    match result {
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            Err(AppError::NotFound(format!("channel not found: {id}")))
        }
        Err(e) => Err(AppError::Database(e)),
        Ok((db_id, opc_id, channel_type_str, is_enabled_i64, feishu_config_json,
            is_connected_i64, last_connected, created_at, updated_at)) => {
            let channel_type = ChannelType::from_str(&channel_type_str).ok_or_else(|| {
                AppError::Internal(format!("unknown channel_type: {channel_type_str}"))
            })?;

            let feishu_config = feishu_config_json
                .as_deref()
                .and_then(ChannelConfig::feishu_config_from_json);

            Ok(ChannelConfig {
                id: db_id.to_string(),
                opc_id,
                channel_type,
                is_enabled: ChannelConfig::i64_to_bool(is_enabled_i64),
                feishu_config,
                is_connected: ChannelConfig::i64_to_bool(is_connected_i64),
                last_connected,
                created_at,
                updated_at,
            })
        }
    }
}

/// チャンネル設定を挿入または更新する。
///
/// - `config.id` が空文字の場合は INSERT として扱い、DB が採番した rowid を返す。
/// - `config.id` が非空（既存 rowid の文字列）の場合は UPDATE を試みる。
///   レコードが存在しない場合は `AppError::NotFound` を返す。
pub fn upsert_channel(pool: &DbPool, config: ChannelConfig) -> Result<i64> {
    let feishu_json = config
        .feishu_config
        .as_ref()
        .map(ChannelConfig::feishu_config_to_json);

    let conn = pool.get()?;

    if config.id.is_empty() {
        // 新規 INSERT
        conn.execute(
            "INSERT INTO channels \
                 (opc_id, channel_type, is_enabled, feishu_config, is_connected, \
                  last_connected, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            rusqlite::params![
                config.opc_id,
                config.channel_type.as_str(),
                ChannelConfig::bool_to_i64(config.is_enabled),
                feishu_json,
                ChannelConfig::bool_to_i64(config.is_connected),
                config.last_connected,
                config.created_at,
                config.updated_at,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    } else {
        // 既存レコードの UPDATE
        let row_id: i64 = config
            .id
            .parse()
            .map_err(|_| AppError::Validation(format!("invalid channel id: {}", config.id)))?;

        let affected = conn.execute(
            "UPDATE channels \
             SET opc_id = ?1, channel_type = ?2, is_enabled = ?3, feishu_config = ?4, \
                 is_connected = ?5, last_connected = ?6, updated_at = ?7 \
             WHERE id = ?8",
            rusqlite::params![
                config.opc_id,
                config.channel_type.as_str(),
                ChannelConfig::bool_to_i64(config.is_enabled),
                feishu_json,
                ChannelConfig::bool_to_i64(config.is_connected),
                config.last_connected,
                config.updated_at,
                row_id,
            ],
        )?;

        if affected == 0 {
            return Err(AppError::NotFound(format!("channel not found: {row_id}")));
        }
        Ok(row_id)
    }
}

/// 指定 ID のチャンネルを削除する。
pub fn delete_channel(pool: &DbPool, id: i64) -> Result<()> {
    let conn = pool.get()?;
    let affected = conn.execute("DELETE FROM channels WHERE id = ?1", [id])?;

    if affected == 0 {
        return Err(AppError::NotFound(format!("channel not found: {id}")));
    }
    Ok(())
}

/// チャンネルの接続状態を更新する。
pub fn update_connection_status(pool: &DbPool, id: i64, is_connected: bool) -> Result<()> {
    let now_ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;

    let last_connected = if is_connected { Some(now_ts) } else { None };

    let conn = pool.get()?;
    let affected = conn.execute(
        "UPDATE channels \
         SET is_connected = ?1, last_connected = ?2, updated_at = ?3 \
         WHERE id = ?4",
        rusqlite::params![
            ChannelConfig::bool_to_i64(is_connected),
            last_connected,
            now_ts,
            id,
        ],
    )?;

    if affected == 0 {
        return Err(AppError::NotFound(format!("channel not found: {id}")));
    }
    Ok(())
}

/// 飞书の接続テストを行う（現時点では HTTP 呼び出しなし）。
///
/// `app_id` と `app_secret` が共に非空であれば `true` を返す。
pub fn test_feishu_connection(app_id: &str, app_secret: &str) -> Result<bool> {
    let is_ok = !app_id.is_empty() && !app_secret.is_empty();
    Ok(is_ok)
}

// ─────────────────────────────────────────────
// テスト
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

        // channels は opc_id 外部キーを持つため、先に opc_config を挿入する
        conn.execute(
            "INSERT INTO opc_config \
                 (id, name, display_name, created_at, updated_at) \
             VALUES ('opc-001', 'test-opc', 'Test OPC', 1700000000, 1700000000)",
            [],
        )
        .expect("insert opc_config");

        DbPool::new_in_memory_for_test(conn)
    }

    fn make_channel(opc_id: &str, channel_type: ChannelType) -> ChannelConfig {
        let now = 1700000000i64;
        ChannelConfig {
            id: String::new(), // 新規 INSERT 時は空
            opc_id: opc_id.to_string(),
            channel_type,
            is_enabled: true,
            feishu_config: None,
            is_connected: false,
            last_connected: None,
            created_at: now,
            updated_at: now,
        }
    }

    // ─── CRUD ライフサイクル ──────────────────────────────────────────────

    #[test]
    fn test_upsert_insert_and_get_channel() {
        let pool = setup_pool();
        let channel = make_channel("opc-001", ChannelType::Feishu);

        let row_id = upsert_channel(&pool, channel).expect("upsert should succeed");
        assert!(row_id > 0);

        let fetched = get_channel(&pool, row_id).expect("get_channel should succeed");
        assert_eq!(fetched.channel_type, ChannelType::Feishu);
        assert_eq!(fetched.opc_id, "opc-001");
        assert!(fetched.is_enabled);
        assert!(!fetched.is_connected);
    }

    #[test]
    fn test_upsert_update_existing_channel() {
        let pool = setup_pool();
        let channel = make_channel("opc-001", ChannelType::Dingtalk);
        let row_id = upsert_channel(&pool, channel).expect("insert should succeed");

        // 更新：id を設定して再 upsert
        let mut updated = make_channel("opc-001", ChannelType::Dingtalk);
        updated.id = row_id.to_string();
        updated.is_enabled = false;
        let updated_id = upsert_channel(&pool, updated).expect("update should succeed");
        assert_eq!(updated_id, row_id);

        let fetched = get_channel(&pool, row_id).expect("get_channel should succeed");
        assert!(!fetched.is_enabled);
    }

    #[test]
    fn test_get_channel_not_found() {
        let pool = setup_pool();
        let err = get_channel(&pool, 9999).expect_err("should return error");
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn test_get_channels_by_opc() {
        let pool = setup_pool();
        upsert_channel(&pool, make_channel("opc-001", ChannelType::Feishu))
            .expect("upsert feishu");
        upsert_channel(&pool, make_channel("opc-001", ChannelType::Wechat))
            .expect("upsert wechat");

        let channels = get_channels(&pool, "opc-001").expect("get_channels should succeed");
        assert_eq!(channels.len(), 2);
    }

    #[test]
    fn test_get_channels_empty_for_unknown_opc() {
        let pool = setup_pool();
        let channels = get_channels(&pool, "nonexistent-opc").expect("should return empty vec");
        assert!(channels.is_empty());
    }

    #[test]
    fn test_delete_channel() {
        let pool = setup_pool();
        let row_id =
            upsert_channel(&pool, make_channel("opc-001", ChannelType::Feishu))
                .expect("upsert should succeed");

        delete_channel(&pool, row_id).expect("delete should succeed");

        let err = get_channel(&pool, row_id).expect_err("should return not found");
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn test_delete_channel_not_found() {
        let pool = setup_pool();
        let err = delete_channel(&pool, 9999).expect_err("should return error");
        assert!(matches!(err, AppError::NotFound(_)));
    }

    #[test]
    fn test_update_connection_status_connected() {
        let pool = setup_pool();
        let row_id =
            upsert_channel(&pool, make_channel("opc-001", ChannelType::Feishu))
                .expect("upsert should succeed");

        update_connection_status(&pool, row_id, true).expect("update should succeed");

        let fetched = get_channel(&pool, row_id).expect("get_channel should succeed");
        assert!(fetched.is_connected);
        assert!(fetched.last_connected.is_some());
    }

    #[test]
    fn test_update_connection_status_disconnected() {
        let pool = setup_pool();
        let row_id =
            upsert_channel(&pool, make_channel("opc-001", ChannelType::Feishu))
                .expect("upsert should succeed");

        // 先に接続状態にする
        update_connection_status(&pool, row_id, true).expect("connect");
        // 切断
        update_connection_status(&pool, row_id, false).expect("disconnect");

        let fetched = get_channel(&pool, row_id).expect("get_channel should succeed");
        assert!(!fetched.is_connected);
        assert!(fetched.last_connected.is_none());
    }

    #[test]
    fn test_update_connection_status_not_found() {
        let pool = setup_pool();
        let err =
            update_connection_status(&pool, 9999, true).expect_err("should return error");
        assert!(matches!(err, AppError::NotFound(_)));
    }

    // ─── feishu_config の保存と復元 ────────────────────────────────────────

    #[test]
    fn test_feishu_config_persisted() {
        let pool = setup_pool();
        let mut channel = make_channel("opc-001", ChannelType::Feishu);
        channel.feishu_config = Some(FeishuConfig {
            app_id: "cli_test123".to_string(),
            app_secret: "secret-value".to_string(),
        });

        let row_id = upsert_channel(&pool, channel).expect("upsert should succeed");
        let fetched = get_channel(&pool, row_id).expect("get_channel should succeed");

        let fc = fetched.feishu_config.expect("feishu_config should be present");
        assert_eq!(fc.app_id, "cli_test123");
        assert_eq!(fc.app_secret, "secret-value");
    }

    // ─── test_feishu_connection ─────────────────────────────────────────────

    #[test]
    fn test_feishu_connection_both_present() {
        let result =
            test_feishu_connection("cli_abc123", "secret_xyz").expect("should succeed");
        assert!(result);
    }

    #[test]
    fn test_feishu_connection_empty_app_id() {
        let result = test_feishu_connection("", "secret_xyz").expect("should succeed");
        assert!(!result);
    }

    #[test]
    fn test_feishu_connection_empty_app_secret() {
        let result = test_feishu_connection("cli_abc123", "").expect("should succeed");
        assert!(!result);
    }

    #[test]
    fn test_feishu_connection_both_empty() {
        let result = test_feishu_connection("", "").expect("should succeed");
        assert!(!result);
    }
}
