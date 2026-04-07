use crate::database::pool::DbPool;
use crate::error::{AppError, Result};
use crate::models::model::{ModelInfo, ProviderConfig};
use crate::utils::crypto;
use uuid::Uuid;

fn now_ts() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn b2i(v: bool) -> i64 {
    if v { 1 } else { 0 }
}

// ─── Row mapper ───────────────────────────────────────────────────────────────

fn row_to_provider(
    id: String, name: String, api: String, base_url: String,
    api_key_enc: String, is_enabled: i64, is_available: i64,
    last_tested: Option<i64>, created_at: i64, updated_at: i64,
) -> Result<ProviderConfig> {
    let api_key = if api_key_enc.is_empty() {
        None
    } else {
        Some(crypto::decrypt(&api_key_enc)?)
    };
    Ok(ProviderConfig {
        id, name, api, base_url, api_key,
        is_enabled: ProviderConfig::i64_to_bool(is_enabled),
        is_available: ProviderConfig::i64_to_bool(is_available),
        last_tested, created_at, updated_at,
    })
}

// ─── Provider CRUD ────────────────────────────────────────────────────────────

pub fn get_providers(pool: &DbPool) -> Result<Vec<ProviderConfig>> {
    let conn = pool.get()?;
    let mut stmt = conn.prepare(
        "SELECT id, name, api, base_url, api_key, is_enabled, is_available, \
         last_tested, created_at, updated_at \
         FROM model_providers_v2 ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, i64>(5)?,
            row.get::<_, i64>(6)?,
            row.get::<_, Option<i64>>(7)?,
            row.get::<_, i64>(8)?,
            row.get::<_, i64>(9)?,
        ))
    })?;

    let mut providers = Vec::new();
    for row in rows {
        let (id, name, api, base_url, api_key_enc, is_enabled, is_available, last_tested, created_at, updated_at) = row?;
        providers.push(row_to_provider(id, name, api, base_url, api_key_enc, is_enabled, is_available, last_tested, created_at, updated_at)?);
    }
    Ok(providers)
}

pub fn get_provider(pool: &DbPool, id: &str) -> Result<ProviderConfig> {
    let conn = pool.get()?;
    let result = conn.query_row(
        "SELECT id, name, api, base_url, api_key, is_enabled, is_available, \
         last_tested, created_at, updated_at \
         FROM model_providers_v2 WHERE id = ?1",
        [id],
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, i64>(5)?,
            row.get::<_, i64>(6)?,
            row.get::<_, Option<i64>>(7)?,
            row.get::<_, i64>(8)?,
            row.get::<_, i64>(9)?,
        )),
    );
    match result {
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            Err(AppError::NotFound(format!("provider not found: {id}")))
        }
        Err(e) => Err(AppError::Database(e)),
        Ok((id, name, api, base_url, api_key_enc, is_enabled, is_available, last_tested, created_at, updated_at)) => {
            row_to_provider(id, name, api, base_url, api_key_enc, is_enabled, is_available, last_tested, created_at, updated_at)
        }
    }
}

pub fn get_provider_by_name(pool: &DbPool, name: &str) -> Result<ProviderConfig> {
    let conn = pool.get()?;
    let result = conn.query_row(
        "SELECT id, name, api, base_url, api_key, is_enabled, is_available, \
         last_tested, created_at, updated_at \
         FROM model_providers_v2 WHERE name = ?1",
        [name],
        |row| Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, String>(4)?,
            row.get::<_, i64>(5)?,
            row.get::<_, i64>(6)?,
            row.get::<_, Option<i64>>(7)?,
            row.get::<_, i64>(8)?,
            row.get::<_, i64>(9)?,
        )),
    );
    match result {
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            Err(AppError::NotFound(format!("provider not found: {name}")))
        }
        Err(e) => Err(AppError::Database(e)),
        Ok((id, name, api, base_url, api_key_enc, is_enabled, is_available, last_tested, created_at, updated_at)) => {
            row_to_provider(id, name, api, base_url, api_key_enc, is_enabled, is_available, last_tested, created_at, updated_at)
        }
    }
}

pub fn create_provider(pool: &DbPool, config: ProviderConfig) -> Result<ProviderConfig> {
    let id = Uuid::new_v4().to_string();
    let now = now_ts();
    let api_key_enc = match &config.api_key {
        Some(k) if !k.is_empty() => crypto::encrypt(k)?,
        _ => String::new(),
    };
    {
        let conn = pool.get()?;
        conn.execute(
            "INSERT INTO model_providers_v2 \
             (id, name, api, base_url, api_key, is_enabled, is_available, last_tested, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![
                &id, &config.name, &config.api, &config.base_url, &api_key_enc,
                b2i(config.is_enabled), b2i(config.is_available),
                config.last_tested, now, now,
            ],
        )?;
    } // conn dropped here, releasing the lock
    get_provider(pool, &id)
}

pub fn update_provider(pool: &DbPool, id: &str, config: ProviderConfig) -> Result<ProviderConfig> {
    let now = now_ts();
    let api_key_enc = match &config.api_key {
        Some(k) if !k.is_empty() => crypto::encrypt(k)?,
        _ => String::new(),
    };
    {
        let conn = pool.get()?;
        let rows = conn.execute(
            "UPDATE model_providers_v2 \
             SET name=?2, api=?3, base_url=?4, api_key=?5, is_enabled=?6, updated_at=?7 \
             WHERE id=?1",
            rusqlite::params![id, config.name, config.api, config.base_url, api_key_enc, b2i(config.is_enabled), now],
        )?;
        if rows == 0 {
            return Err(AppError::NotFound(format!("provider not found: {id}")));
        }
    }
    get_provider(pool, id)
}

/// Partial update for provider (only update provided fields)
pub fn update_provider_partial(
    pool: &DbPool,
    id: &str,
    name: Option<String>,
    api: Option<String>,
    base_url: Option<String>,
    api_key: Option<String>,
    is_enabled: Option<bool>,
) -> Result<ProviderConfig> {
    let now = now_ts();

    // First get current values (releases lock after)
    let current = get_provider(pool, id)?;

    // Merge with new values
    let new_name = name.unwrap_or(current.name);
    let new_api = api.unwrap_or(current.api);
    let new_base_url = base_url.unwrap_or(current.base_url);
    let new_is_enabled = is_enabled.unwrap_or(current.is_enabled);

    // Encrypt new key if provided, otherwise reuse existing encrypted key from DB
    let api_key_enc = match &api_key {
        Some(k) if !k.is_empty() => crypto::encrypt(k)?,
        None => {
            // Fetch existing encrypted key from DB
            let conn = pool.get()?;
            conn.query_row(
                "SELECT api_key FROM model_providers_v2 WHERE id = ?1",
                [id],
                |row| row.get::<_, String>(0),
            )?
        }
        Some(_) => String::new(), // Empty string provided
    };

    {
        let conn = pool.get()?;
        let rows = conn.execute(
            "UPDATE model_providers_v2 \
             SET name=?2, api=?3, base_url=?4, api_key=?5, is_enabled=?6, updated_at=?7 \
             WHERE id=?1",
            rusqlite::params![id, new_name, new_api, new_base_url, api_key_enc, b2i(new_is_enabled), now],
        )?;
        if rows == 0 {
            return Err(AppError::NotFound(format!("provider not found: {id}")));
        }
    }
    get_provider(pool, id)
}

pub fn delete_provider(pool: &DbPool, id: &str) -> Result<()> {
    tracing::info!("delete_provider: deleting id={}", id);
    let conn = pool.get()?;
    let rows = conn.execute(
        "DELETE FROM model_providers_v2 WHERE id = ?1",
        rusqlite::params![id],
    )?;
    tracing::info!("delete_provider: {} rows deleted", rows);
    if rows == 0 {
        return Err(AppError::NotFound(format!("provider not found: {id}")));
    }
    Ok(())
}

/// 保存连接测试结果
pub fn save_test_result(pool: &DbPool, provider_id: &str, ok: bool) -> Result<()> {
    let now = now_ts();
    let conn = pool.get()?;
    conn.execute(
        "UPDATE model_providers_v2 SET is_available=?2, last_tested=?3, updated_at=?3 WHERE id=?1",
        rusqlite::params![provider_id, b2i(ok), now],
    )?;
    Ok(())
}

// ─── Model CRUD ───────────────────────────────────────────────────────────────

fn row_to_model(row: &rusqlite::Row) -> rusqlite::Result<ModelInfo> {
    Ok(ModelInfo {
        id: row.get(0)?,
        provider_name: row.get(1)?,
        model_id: row.get(2)?,
        display_name: row.get(3)?,
        context_window: row.get(4)?,
        max_tokens: row.get(5)?,
        input_types: row.get(6)?,
        cost_input: row.get(7)?,
        cost_output: row.get(8)?,
        supports_vision: ModelInfo::i64_to_bool(row.get::<_, i64>(9)?),
        supports_function_calling: ModelInfo::i64_to_bool(row.get::<_, i64>(10)?),
        supports_streaming: ModelInfo::i64_to_bool(row.get::<_, i64>(11)?),
        is_custom: ModelInfo::i64_to_bool(row.get::<_, i64>(12)?),
        sort_order: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

const MODEL_SELECT: &str =
    "SELECT id, provider_name, model_id, display_name, context_window, max_tokens, input_types, \
     cost_input, cost_output, supports_vision, supports_function_calling, supports_streaming, \
     is_custom, sort_order, updated_at FROM model_info_v2";

pub fn get_models(pool: &DbPool, provider_name: Option<&str>) -> Result<Vec<ModelInfo>> {
    let conn = pool.get()?;
    let models = if let Some(pname) = provider_name {
        let sql = format!("{} WHERE provider_name = ?1 ORDER BY sort_order, model_id", MODEL_SELECT);
        let mut stmt = conn.prepare(&sql)?;
        let x = stmt.query_map(rusqlite::params![pname], row_to_model)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        x
    } else {
        let sql = format!("{} ORDER BY provider_name, sort_order, model_id", MODEL_SELECT);
        let mut stmt = conn.prepare(&sql)?;
        let x = stmt.query_map([], row_to_model)?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        x
    };
    Ok(models)
}

pub fn set_models(pool: &DbPool, provider_name: &str, models: Vec<ModelInfo>) -> Result<()> {
    let conn = pool.get()?;
    let now = now_ts();

    let model_ids: Vec<&str> = models.iter().map(|m| m.model_id.as_str()).collect();
    if !model_ids.is_empty() {
        let placeholders = model_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let delete_sql = format!(
            "DELETE FROM model_info_v2 WHERE provider_name = ?1 AND model_id NOT IN ({})",
            placeholders
        );
        let mut delete_stmt = conn.prepare(&delete_sql)?;
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(provider_name.to_string())];
        for id in &model_ids {
            params.push(Box::new(id.to_string()));
        }
        delete_stmt.execute(rusqlite::params_from_iter(
            params.iter().map(|b| b.as_ref() as &dyn rusqlite::ToSql),
        ))?;
    } else {
        conn.execute(
            "DELETE FROM model_info_v2 WHERE provider_name = ?1",
            rusqlite::params![provider_name],
        )?;
    }

    for (idx, model) in models.iter().enumerate() {
        let id = if model.id.is_empty() {
            Uuid::new_v4().to_string()
        } else {
            model.id.clone()
        };
        conn.execute(
            "INSERT INTO model_info_v2 \
             (id, provider_name, model_id, display_name, context_window, max_tokens, \
              input_types, cost_input, cost_output, supports_vision, supports_function_calling, \
              supports_streaming, is_custom, sort_order, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15) \
             ON CONFLICT(provider_name, model_id) DO UPDATE SET \
             display_name=excluded.display_name, context_window=excluded.context_window, \
             max_tokens=excluded.max_tokens, input_types=excluded.input_types, \
             cost_input=excluded.cost_input, cost_output=excluded.cost_output, \
             supports_vision=excluded.supports_vision, \
             supports_function_calling=excluded.supports_function_calling, \
             supports_streaming=excluded.supports_streaming, is_custom=excluded.is_custom, \
             sort_order=excluded.sort_order, updated_at=excluded.updated_at",
            rusqlite::params![
                id, provider_name, model.model_id, model.display_name,
                model.context_window, model.max_tokens, model.input_types,
                model.cost_input, model.cost_output,
                ModelInfo::bool_to_i64(model.supports_vision),
                ModelInfo::bool_to_i64(model.supports_function_calling),
                ModelInfo::bool_to_i64(model.supports_streaming),
                ModelInfo::bool_to_i64(model.is_custom),
                idx as i64, now,
            ],
        )?;
    }
    Ok(())
}
