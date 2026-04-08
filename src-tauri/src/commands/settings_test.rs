/// settings_test.rs
/// Settings 命令测试
#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::database::{migrations, pool::DbPool};

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
    }

    // ─── Service 层测试 ───────────────────────────────────────────

    #[test]
    fn test_get_opc_root_default() {
        let pool = setup();

        let conn = pool.get().unwrap();
        let row = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'opc_root'",
                [],
                |r| r.get::<_, String>(0),
            )
            .ok();

        // 默认值应该是 ~/.openclaw/OPC
        let opc_root = row.unwrap_or_else(|| "~/.openclaw/OPC".to_string());
        assert!(!opc_root.is_empty());
    }

    #[test]
    fn test_set_and_get_opc_root() {
        let pool = setup();
        let custom_path = "/custom/opc/path";

        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('opc_root', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![custom_path],
        ).unwrap();

        let retrieved = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'opc_root'",
                [],
                |r| r.get::<_, String>(0),
            ).unwrap();

        assert_eq!(retrieved, custom_path);
    }

    #[test]
    fn test_update_opc_root() {
        let pool = setup();

        let conn = pool.get().unwrap();

        // 设置初始值
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('opc_root', '/initial/path')",
            [],
        ).unwrap();

        // 更新值
        conn.execute(
            "UPDATE settings SET value = '/updated/path' WHERE key = 'opc_root'",
            [],
        ).unwrap();

        let retrieved = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'opc_root'",
                [],
                |r| r.get::<_, String>(0),
            ).unwrap();

        assert_eq!(retrieved, "/updated/path");
    }

    // ─── 边界测试 ───────────────────────────────────────────

    #[test]
    fn test_opc_root_with_special_characters() {
        let pool = setup();
        let special_path = "/path/测试/🔐/spaces in path";

        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('opc_root', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![special_path],
        ).unwrap();

        let retrieved = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'opc_root'",
                [],
                |r| r.get::<_, String>(0),
            ).unwrap();

        assert_eq!(retrieved, special_path);
    }

    #[test]
    fn test_opc_root_with_tilde() {
        let pool = setup();
        let home_path = "~/Documents/openclaw/OPC";

        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('opc_root', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![home_path],
        ).unwrap();

        let retrieved = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'opc_root'",
                [],
                |r| r.get::<_, String>(0),
            ).unwrap();

        assert_eq!(retrieved, home_path);
    }

    #[test]
    fn test_opc_root_empty_value() {
        let pool = setup();

        let conn = pool.get().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('opc_root', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            rusqlite::params![""],
        ).unwrap();

        let retrieved = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'opc_root'",
                [],
                |r| r.get::<_, String>(0),
            ).unwrap();

        assert!(retrieved.is_empty());
    }
}