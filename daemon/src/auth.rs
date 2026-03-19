use axum::{
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use crate::{error::AppError, state::AppState};

pub async fn require_auth(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let auth_header = request
        .headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok());

    let token = match auth_header {
        Some(h) if h.starts_with("Bearer ") => &h[7..],
        _ => return Err(AppError::Unauthorized),
    };

    if token != state.api_key {
        return Err(AppError::Unauthorized);
    }

    Ok(next.run(request).await)
}
