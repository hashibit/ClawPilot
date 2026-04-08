/// skill_test.rs
/// Skill 命令测试
#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::database::{migrations, pool::DbPool};
    use crate::error::AppError;
    use crate::models::skill::SkillInfo;
    use crate::services::skill_service::{self, LocalSkillInput};

    fn setup() -> DbPool {
        let conn = Connection::open_in_memory().unwrap();
        let pool = DbPool::new_in_memory_for_test(conn);
        migrations::run_migrations(&pool).unwrap();
        pool
    }

    fn make_skill_input(name: &str) -> LocalSkillInput {
        LocalSkillInput {
            name: name.to_string(),
            display_name: format!("{} Skill", name),
            description: Some(format!("A test skill named {}", name)),
            category: Some("test".to_string()),
        }
    }

    // ─── Serde 测试 ───────────────────────────────────────────

    #[test]
    fn test_skill_info_serde_roundtrip() {
        let skill = SkillInfo {
            id: 1,
            name: "test-skill".to_string(),
            display_name: "Test Skill".to_string(),
            description: Some("A test skill".to_string()),
            category: Some("utility".to_string()),
            slug: Some("test-skill".to_string()),
            version: Some("1.0.0".to_string()),
            author: Some("test-author".to_string()),
            tags: vec!["test".to_string(), "skill".to_string()],
            url: Some("https://example.com/skill".to_string()),
            download_url: None,
            is_local: true,
            is_installed: true,
            install_path: Some("/path/to/skill".to_string()),
            installed_at: Some(1700000000),
            created_at: 1700000000,
        };

        let json = serde_json::to_string(&skill).expect("serialize failed");
        let decoded: SkillInfo = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.id, skill.id);
        assert_eq!(decoded.name, skill.name);
        assert_eq!(decoded.tags, skill.tags);
    }

    #[test]
    fn test_local_skill_input_serde() {
        let input = LocalSkillInput {
            name: "my-skill".to_string(),
            display_name: "My Skill".to_string(),
            description: Some("Description".to_string()),
            category: Some("dev".to_string()),
        };

        let json = serde_json::to_string(&input).expect("serialize failed");
        let decoded: LocalSkillInput = serde_json::from_str(&json).expect("deserialize failed");

        assert_eq!(decoded.name, input.name);
    }

    #[test]
    fn test_local_skill_input_minimal() {
        let json = r#"{
            "name": "minimal-skill",
            "display_name": "Minimal"
        }"#;

        let decoded: LocalSkillInput = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(decoded.name, "minimal-skill");
        assert!(decoded.description.is_none());
        assert!(decoded.category.is_none());
    }

    #[test]
    fn test_skill_info_with_tags() {
        let json = r#"{
            "id": 2,
            "name": "tagged-skill",
            "display_name": "Tagged",
            "tags": ["ai", "automation", "test"]
        }"#;

        let decoded: SkillInfo = serde_json::from_str(json).expect("deserialize failed");
        assert_eq!(decoded.tags.len(), 3);
        assert!(decoded.tags.contains(&"ai".to_string()));
    }

    // ─── Service 层测试 ───────────────────────────────────────────

    #[test]
    fn test_create_and_get_skill() {
        let pool = setup();
        let input = make_skill_input("test-skill");

        let id = skill_service::create_skill(&pool, input).unwrap();
        assert!(id > 0);

        let skills = skill_service::get_skills(&pool).unwrap();
        assert!(skills.iter().any(|s| s.id == id));
    }

    #[test]
    fn test_get_bundle_skills_metadata() {
        let pool = setup();
        let result = skill_service::get_bundle_skills_metadata(&pool);
        assert!(result.is_ok());

        let value = result.unwrap();
        // 应该返回 JSON 对象
        assert!(value.is_object());
    }

    #[test]
    fn test_delete_skill() {
        let pool = setup();
        let input = make_skill_input("to-delete");
        let id = skill_service::create_skill(&pool, input).unwrap();

        skill_service::delete_skill(&pool, id).unwrap();

        let skills = skill_service::get_skills(&pool).unwrap();
        assert!(!skills.iter().any(|s| s.id == id));
    }

    #[test]
    fn test_delete_nonexistent_skill() {
        let pool = setup();
        let result = skill_service::delete_skill(&pool, 999999);
        assert!(result.is_ok() || matches!(result, Err(AppError::NotFound(_))));
    }

    // ─── 边界测试 ───────────────────────────────────────────

    #[test]
    fn test_skill_with_empty_name() {
        let pool = setup();
        let input = LocalSkillInput {
            name: String::new(),
            display_name: "Empty Name Skill".to_string(),
            description: None,
            category: None,
        };

        let result = skill_service::create_skill(&pool, input);
        assert!(result.is_ok() || matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn test_skill_with_special_name() {
        let pool = setup();
        let input = LocalSkillInput {
            name: "skill-测试-🔐".to_string(),
            display_name: "Special Skill".to_string(),
            description: None,
            category: None,
        };

        let id = skill_service::create_skill(&pool, input).unwrap();
        let skills = skill_service::get_skills(&pool).unwrap();
        let skill = skills.iter().find(|s| s.id == id).unwrap();
        assert_eq!(skill.name, "skill-测试-🔐");
    }
}