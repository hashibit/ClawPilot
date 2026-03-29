//! Inbox message delivery and management
//!
//! Handles sending messages between agents for task notifications.

use crate::scheduler::{Db, models::*};

/// Send a message to an agent's inbox
pub fn deliver_message(db: &Db, msg: &InboxMessage) -> anyhow::Result<()> {
    db.create_inbox_message(msg)
}

/// Send task_started notification from daemon to publisher
pub fn send_task_started(
    db: &Db,
    publisher_agent_id: &str,
    task_id: &str,
    receiver_agent_id: &str,
) -> anyhow::Result<()> {
    let payload = TaskStartedPayload {
        receiver_agent_id: receiver_agent_id.to_string(),
        started_at: chrono::Utc::now().timestamp(),
    };
    let payload_json = serde_json::to_string(&payload)?;

    let msg = InboxMessage::new(
        format!("msg-start-{}", task_id),
        publisher_agent_id.to_string(),
        "daemon".to_string(),
        InboxMessageType::TaskStarted,
        task_id.to_string(),
        payload_json,
    );

    deliver_message(db, &msg)
}

/// Send task_done notification from worker to publisher
pub fn send_task_done(
    db: &Db,
    publisher_agent_id: &str,
    from_agent_id: &str,
    task_id: &str,
    result: &str,
    output_artifact_ids: Vec<String>,
) -> anyhow::Result<()> {
    let payload = TaskDonePayload {
        result: result.to_string(),
        output_artifact_ids,
    };
    let payload_json = serde_json::to_string(&payload)?;

    let msg = InboxMessage::new(
        format!("msg-done-{}", task_id),
        publisher_agent_id.to_string(),
        from_agent_id.to_string(),
        InboxMessageType::TaskDone,
        task_id.to_string(),
        payload_json,
    );

    deliver_message(db, &msg)
}

/// Send task_failed notification from worker to publisher
pub fn send_task_failed(
    db: &Db,
    publisher_agent_id: &str,
    from_agent_id: &str,
    task_id: &str,
    error: &str,
    retry_count: i32,
) -> anyhow::Result<()> {
    let payload = TaskFailedPayload {
        error: error.to_string(),
        retry_count,
    };
    let payload_json = serde_json::to_string(&payload)?;

    let msg = InboxMessage::new(
        format!("msg-fail-{}", task_id),
        publisher_agent_id.to_string(),
        from_agent_id.to_string(),
        InboxMessageType::TaskFailed,
        task_id.to_string(),
        payload_json,
    );

    deliver_message(db, &msg)
}

/// Send task_cancelled notification from publisher to worker
pub fn send_task_cancelled(
    db: &Db,
    to_agent_id: &str,
    from_agent_id: &str,
    task_id: &str,
    reason: &str,
) -> anyhow::Result<()> {
    let payload = TaskCancelledPayload {
        reason: reason.to_string(),
    };
    let payload_json = serde_json::to_string(&payload)?;

    let msg = InboxMessage::new(
        format!("msg-cancel-{}", task_id),
        to_agent_id.to_string(),
        from_agent_id.to_string(),
        InboxMessageType::TaskCancelled,
        task_id.to_string(),
        payload_json,
    );

    deliver_message(db, &msg)
}

/// Send task_progress notification from worker to publisher
pub fn send_task_progress(
    db: &Db,
    publisher_agent_id: &str,
    from_agent_id: &str,
    task_id: &str,
    progress: i32,
    message: &str,
) -> anyhow::Result<()> {
    let payload = TaskProgressPayload {
        progress,
        message: message.to_string(),
    };
    let payload_json = serde_json::to_string(&payload)?;

    let msg = InboxMessage::new(
        format!("msg-progress-{}", task_id),
        publisher_agent_id.to_string(),
        from_agent_id.to_string(),
        InboxMessageType::TaskProgress,
        task_id.to_string(),
        payload_json,
    );

    deliver_message(db, &msg)
}

/// Get inbox messages for an agent
pub fn get_inbox_messages(
    db: &Db,
    agent_id: &str,
    unread_only: bool,
    limit: i32,
) -> anyhow::Result<Vec<InboxMessage>> {
    db.get_inbox_messages(agent_id, unread_only, limit)
}

/// Mark inbox message as read
pub fn mark_message_read(db: &Db, msg_id: &str) -> anyhow::Result<()> {
    db.mark_inbox_read(msg_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::NamedTempFile;

    fn create_test_db() -> Db {
        Db::new_in_memory().unwrap()
    }

    #[test]
    fn test_send_task_started() {
        let db = create_test_db();
        let result = send_task_started(&db, "orchestrator", "task-1", "worker-1");
        assert!(result.is_ok());

        let messages = get_inbox_messages(&db, "orchestrator", false, 10);
        assert!(messages.is_ok());
        assert_eq!(messages.unwrap().len(), 1);
    }

    #[test]
    fn test_send_task_done() {
        let db = create_test_db();
        let result = send_task_done(
            &db,
            "orchestrator",
            "worker-1",
            "task-1",
            "result",
            vec!["art-1".to_string()],
        );
        assert!(result.is_ok());
    }

    #[test]
    fn test_send_task_failed() {
        let db = create_test_db();
        let result = send_task_failed(&db, "orchestrator", "worker-1", "task-1", "error", 2);
        assert!(result.is_ok());
    }

    #[test]
    fn test_send_task_cancelled() {
        let db = create_test_db();
        let result = send_task_cancelled(&db, "worker-1", "orchestrator", "task-1", "Plan cancelled");
        assert!(result.is_ok());
    }

    #[test]
    fn test_send_task_progress() {
        let db = create_test_db();
        let result = send_task_progress(&db, "orchestrator", "worker-1", "task-1", 50, "Halfway done");
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_inbox_messages() {
        let db = create_test_db();

        // Send a few messages
        send_task_started(&db, "orchestrator", "task-1", "worker-1").unwrap();
        send_task_progress(&db, "orchestrator", "worker-1", "task-1", 25, "Progress").unwrap();

        let messages = get_inbox_messages(&db, "orchestrator", false, 10).unwrap();
        assert_eq!(messages.len(), 2);

        let unread = get_inbox_messages(&db, "orchestrator", true, 10).unwrap();
        assert_eq!(unread.len(), 2); // All unread

        // Mark one as read
        mark_message_read(&db, &messages[0].id).unwrap();
        let unread = get_inbox_messages(&db, "orchestrator", true, 10).unwrap();
        assert_eq!(unread.len(), 1);
    }
}