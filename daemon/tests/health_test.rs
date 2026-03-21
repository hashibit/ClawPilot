use axum::Router;
use axum_test::TestServer;
use serde_json::json;

fn create_test_app() -> Router {
    use axum::routing::{get, post};
    use axum::{routing, Json};
    use serde::{Deserialize, Serialize};

    #[derive(Serialize)]
    struct HealthResponse {
        status: String,
        version: String,
    }

    async fn health_check() -> Json<HealthResponse> {
        Json(HealthResponse {
            status: "ok".to_string(),
            version: "0.1.0".to_string(),
        })
    }

    Router::new()
        .route("/health", get(health_check))
}

#[tokio::test]
async fn test_health_check() {
    let app = create_test_app();
    let server = TestServer::new(app).unwrap();

    let response = server.get("/health").await;

    response.assert_status_ok();

    let body = response.json::<serde_json::Value>();
    assert_eq!(body["status"], "ok");
    assert_eq!(body["version"], "0.1.0");
}

#[tokio::test]
async fn test_health_check_returns_json() {
    let app = create_test_app();
    let server = TestServer::new(app).unwrap();

    let response = server.get("/health").await;

    response.assert_status_ok();
    let content_type = response.header("content-type");
    assert!(content_type.to_str().unwrap_or("").contains("application/json"));
}
