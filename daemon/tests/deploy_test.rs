use axum::Router;
use axum_test::TestServer;
use serde_json::json;

fn create_test_app() -> Router {
    use axum::routing::{get, post};
    use axum::{routing, Json};
    use serde::{Deserialize, Serialize};

    #[derive(Deserialize)]
    struct DeployRequest {
        manifest: String,
    }

    #[derive(Serialize)]
    struct DeployResponse {
        task_id: String,
    }

    #[derive(Serialize)]
    struct TaskStatus {
        status: String,
        progress: i32,
        logs: Vec<String>,
    }

    async fn deploy() -> Json<DeployResponse> {
        Json(DeployResponse {
            task_id: "task-123".to_string(),
        })
    }

    async fn get_task_status() -> Json<TaskStatus> {
        Json(TaskStatus {
            status: "running".to_string(),
            progress: 50,
            logs: vec!["Step 1 completed".to_string()],
        })
    }

    Router::new()
        .route("/deploy", post(deploy))
        .route("/deploy/:task_id", get(get_task_status))
}

#[tokio::test]
async fn test_deploy_endpoint() {
    let app = create_test_app();
    let server = TestServer::new(app).unwrap();

    let response = server
        .post("/deploy")
        .content_type("multipart/form-data")
        .await;

    response.assert_status_ok();

    let body = response.json::<serde_json::Value>();
    assert!(body["task_id"].as_str().is_some());
}

#[tokio::test]
async fn test_get_task_status() {
    let app = create_test_app();
    let server = TestServer::new(app).unwrap();

    let response = server.get("/deploy/task-123").await;

    response.assert_status_ok();

    let body = response.json::<serde_json::Value>();
    assert_eq!(body["status"], "running");
    assert_eq!(body["progress"], 50);
}

#[tokio::test]
async fn test_task_status_returns_valid_structure() {
    let app = create_test_app();
    let server = TestServer::new(app).unwrap();

    let response = server.get("/deploy/task-123").await;

    response.assert_status_ok();

    let body = response.json::<serde_json::Value>();
    assert!(body["status"].is_string());
    assert!(body["progress"].is_number());
    assert!(body["logs"].is_array());
}
