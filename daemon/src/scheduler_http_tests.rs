/// Integration tests for the multi-agent DAG scheduler HTTP API.
///
/// Covers the full request→response cycle: create plan → approve → query status,
/// plus validation paths (unknown agent, circular dependency, double-approve, cancel).
///
/// The scheduler router is wired up with a real in-memory SQLite DB, Worker, and
/// DagScheduler — no mocking. The worker will attempt (and fail) to spawn an
/// `openclaw` process, so task status transitions beyond `in_progress` are not
/// exercised here; those are covered in the unit tests in `src/tests.rs`.

#[cfg(test)]
mod scheduler_http_tests {
    use axum::Router;
    use axum_test::TestServer;
    use serde_json::{json, Value};

    use crate::{
        scheduler::{
            db::Db,
            models::{AgentInfo, AgentStatus},
            routes::scheduler_router,
            DagScheduler, Worker,
        },
        state::AppState,
    };


    // -----------------------------------------------------------------------
    // Test server factory
    // -----------------------------------------------------------------------

    /// Creates a TestServer backed by real in-memory components.
    /// Two agents ("agent-a", "agent-b") are pre-registered so plan creation
    /// can validate receiver_agent_id values.
    fn make_server() -> (TestServer, Db) {
        let db = Db::new_in_memory().unwrap();

        for id in ["agent-a", "agent-b"] {
            db.upsert_agent(&AgentInfo::new(
                id.to_string(),
                id.to_string(),
                vec!["work".to_string()],
            ))
            .unwrap();
        }

        let worker = Worker::new();
        let dag = DagScheduler::new(db.clone(), worker.clone());
        let state = AppState::new().with_scheduler(db.clone(), worker, dag);

        let app: Router = scheduler_router().with_state(state);
        (TestServer::new(app).unwrap(), db)
    }

    // -----------------------------------------------------------------------
    // JSON body helpers
    // -----------------------------------------------------------------------

    fn plan_body(id: &str, tasks: Value, deps: Value) -> Value {
        json!({
            "id": id,
            "publisher_agent_id": "agent-a",
            "content": "test plan",
            "tasks": tasks,
            "dependencies": deps
        })
    }

    fn task(id: &str, agent: &str) -> Value {
        json!({
            "id": id,
            "receiver_agent_id": agent,
            "type": "work",
            "priority": 0,
            "params": "{}",
            "result_schema": "{}",
            "timeout_seconds": 300
        })
    }

    // -----------------------------------------------------------------------
    // Validation: unknown agent
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn create_plan_unknown_agent_returns_400() {
        let (server, _) = make_server();

        let body = plan_body(
            "plan-unknown-agent",
            json!([task("t1", "nonexistent-agent")]),
            json!([]),
        );

        let resp = server
            .post("/api/plans")

            .json(&body)
            .await;

        resp.assert_status_bad_request();
        let json = resp.json::<Value>();
        assert!(
            json["error"]
                .as_str()
                .unwrap()
                .contains("nonexistent-agent"),
            "error should name the unknown agent"
        );
    }

    // -----------------------------------------------------------------------
    // Validation: circular dependency
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn create_plan_circular_dependency_returns_400() {
        let (server, _) = make_server();

        // t1 → t2 → t1
        let body = plan_body(
            "plan-cycle",
            json!([task("t1", "agent-a"), task("t2", "agent-b")]),
            json!([
                { "task_id": "t2", "depends_on_task_id": "t1" },
                { "task_id": "t1", "depends_on_task_id": "t2" }
            ]),
        );

        let resp = server
            .post("/api/plans")

            .json(&body)
            .await;

        resp.assert_status_bad_request();
        assert!(
            resp.json::<Value>()["error"]
                .as_str()
                .unwrap()
                .to_lowercase()
                .contains("circular"),
            "error should mention circular dependency"
        );
    }

    // -----------------------------------------------------------------------
    // Validation: dependency referencing a task not in the plan
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn create_plan_dep_references_unknown_task_returns_400() {
        let (server, _) = make_server();

        let body = plan_body(
            "plan-bad-dep",
            json!([task("t1", "agent-a")]),
            json!([{ "task_id": "t1", "depends_on_task_id": "t-ghost" }]),
        );

        let resp = server
            .post("/api/plans")

            .json(&body)
            .await;

        resp.assert_status_bad_request();
    }

    // -----------------------------------------------------------------------
    // Happy path: create plan
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn create_plan_success_returns_pending_approval() {
        let (server, _) = make_server();

        let body = plan_body(
            "plan-ok",
            json!([task("t1", "agent-a"), task("t2", "agent-b")]),
            json!([]),
        );

        let resp = server
            .post("/api/plans")

            .json(&body)
            .await;

        resp.assert_status_ok();
        let json = resp.json::<Value>();
        assert_eq!(json["id"], "plan-ok");
        assert_eq!(json["status"], "pending_approval");
    }

    // -----------------------------------------------------------------------
    // Happy path: get plan detail
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn get_plan_detail_includes_tasks() {
        let (server, _) = make_server();

        let body = plan_body(
            "plan-detail",
            json!([task("t1", "agent-a"), task("t2", "agent-b")]),
            json!([{ "task_id": "t2", "depends_on_task_id": "t1" }]),
        );
        server
            .post("/api/plans")

            .json(&body)
            .await
            .assert_status_ok();

        let resp = server
            .get("/api/plans/plan-detail")

            .await;

        resp.assert_status_ok();
        let json = resp.json::<Value>();
        assert_eq!(json["plan"]["id"], "plan-detail");

        let tasks = json["tasks"].as_array().unwrap();
        assert_eq!(tasks.len(), 2, "both tasks must appear in detail");
    }

    // -----------------------------------------------------------------------
    // 404: unknown plan
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn get_plan_not_found_returns_404() {
        let (server, _) = make_server();

        let resp = server
            .get("/api/plans/does-not-exist")

            .await;

        resp.assert_status_not_found();
    }

    // -----------------------------------------------------------------------
    // Approve: transitions plan to executing
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn approve_plan_transitions_to_executing() {
        let (server, _) = make_server();

        let body = plan_body("plan-approve", json!([task("t1", "agent-a")]), json!([]));
        server
            .post("/api/plans")

            .json(&body)
            .await
            .assert_status_ok();

        let resp = server
            .patch("/api/plans/plan-approve/approve")

            .await;

        resp.assert_status_ok();
        assert_eq!(
            resp.json::<Value>()["status"],
            "executing",
            "plan should be executing after approval"
        );
    }

    // -----------------------------------------------------------------------
    // Approve: idempotency guard
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn double_approve_returns_400() {
        let (server, _) = make_server();

        let body = plan_body("plan-double", json!([task("t1", "agent-a")]), json!([]));
        server
            .post("/api/plans")

            .json(&body)
            .await
            .assert_status_ok();

        server
            .patch("/api/plans/plan-double/approve")

            .await
            .assert_status_ok();

        server
            .patch("/api/plans/plan-double/approve")

            .await
            .assert_status_bad_request();
    }

    // -----------------------------------------------------------------------
    // Cancel
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn cancel_pending_plan_transitions_to_cancelled() {
        let (server, _) = make_server();

        let body = plan_body("plan-cancel", json!([task("t1", "agent-a")]), json!([]));
        server
            .post("/api/plans")

            .json(&body)
            .await
            .assert_status_ok();

        let resp = server
            .patch("/api/plans/plan-cancel/cancel")

            .await;

        resp.assert_status_ok();
        assert_eq!(resp.json::<Value>()["status"], "cancelled");
    }

    #[tokio::test]
    async fn cancel_nonexistent_plan_returns_404() {
        let (server, _) = make_server();

        let resp = server
            .patch("/api/plans/ghost/cancel")

            .await;

        resp.assert_status_not_found();
    }

    // -----------------------------------------------------------------------
    // DAG: downstream task blocked until dependency completes
    // -----------------------------------------------------------------------

    /// After approving a plan with a t1 → t2 chain, t2 must not be "ready"
    /// because t1 is still running (or failed due to missing openclaw binary).
    /// Validates that the DAG sweep correctly gates t2 behind t1.
    #[tokio::test]
    async fn dag_chain_blocks_downstream_task() {
        let (server, db) = make_server();

        let body = plan_body(
            "plan-chain",
            json!([task("t1", "agent-a"), task("t2", "agent-b")]),
            json!([{ "task_id": "t2", "depends_on_task_id": "t1" }]),
        );
        server
            .post("/api/plans")

            .json(&body)
            .await
            .assert_status_ok();

        // Approve — DAG sweep runs synchronously inside approve_plan before returning
        server
            .patch("/api/plans/plan-chain/approve")

            .await
            .assert_status_ok();

        // Brief yield so the async worker task can attempt to start t1
        tokio::time::sleep(tokio::time::Duration::from_millis(200)).await;

        // t2 must not be ready: its dependency (t1) has not completed
        let ready_ids: Vec<String> = db
            .get_ready_tasks("plan-chain")
            .into_iter()
            .map(|t| t.id)
            .collect();

        assert!(
            !ready_ids.contains(&"t2".to_string()),
            "t2 must remain blocked until t1 completes; ready tasks: {:?}",
            ready_ids
        );
    }

    // -----------------------------------------------------------------------
    // Agents list
    // -----------------------------------------------------------------------

    #[tokio::test]
    async fn list_agents_returns_registered_agents() {
        let (server, _) = make_server();

        let resp = server
            .get("/api/agents")

            .await;

        resp.assert_status_ok();
        let json = resp.json::<Value>();
        let agents = json["agents"].as_array().unwrap();
        assert_eq!(agents.len(), 2, "should list the two pre-registered agents");

        let ids: Vec<&str> = agents
            .iter()
            .map(|a| a["agent_id"].as_str().unwrap())
            .collect();
        assert!(ids.contains(&"agent-a"));
        assert!(ids.contains(&"agent-b"));
    }
}
