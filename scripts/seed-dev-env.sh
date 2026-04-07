#!/bin/bash
# seed-dev-env.sh - Initialize development database with seed data
#
# Usage:
#   ./seed-dev-env.sh              # Use default DB path (~/.clawpilot/clawpilot.db)
#   ./seed-dev-env.sh /path/to/db  # Use custom DB path

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Default to ~/.clawpilot/clawpilot.db (same as server and Tauri)
# Can be overridden by first argument or CLAWPILOT_DB_PATH env var
if [ -n "$1" ]; then
    DB_PATH="$1"
elif [ -n "$CLAWPILOT_DB_PATH" ]; then
    DB_PATH="$CLAWPILOT_DB_PATH"
else
    DB_PATH="$HOME/.clawpilot/clawpilot.db"
fi

echo "=========================================="
echo "ClawPilot Development Environment Seeder"
echo "=========================================="
echo ""

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "Database not found at $DB_PATH"
    echo "Creating database directory..."
    mkdir -p "$(dirname "$DB_PATH")"
    echo "Please run 'npm run server:dev' first to initialize the database schema."
    exit 1
fi

echo "Database: $DB_PATH"
echo ""

# Seed data using SQLite
sqlite3 "$DB_PATH" <<'EOF'

-- =============================================================================
-- 1. Seed Model Providers (common LLM providers)
-- =============================================================================

INSERT OR IGNORE INTO model_providers_v2 (id, name, api, base_url, api_key, is_enabled, created_at, updated_at)
VALUES
    ('openai', 'OpenAI', 'openai-completions', 'https://api.openai.com/v1', '', 1, strftime('%s', 'now'), strftime('%s', 'now')),
    ('anthropic', 'Anthropic', 'anthropic-completions', 'https://api.anthropic.com', '', 1, strftime('%s', 'now'), strftime('%s', 'now')),
    ('bailian', '阿里百炼', 'openai-completions', 'https://coding.dashscope.aliyuncs.com/v1', '', 1, strftime('%s', 'now'), strftime('%s', 'now')),
    ('volcengine', '火山方舟', 'openai-completions', 'https://ark.cn-beijing.volces.com/api/v3', '', 1, strftime('%s', 'now'), strftime('%s', 'now')),
    ('minimax', 'MiniMax', 'openai-completions', 'https://api.minimax.chat/v1', '', 1, strftime('%s', 'now'), strftime('%s', 'now'));

-- =============================================================================
-- 2. Seed Model Info (popular models)
-- =============================================================================

INSERT OR IGNORE INTO model_info_v2 (id, provider_name, model_id, display_name, context_window, max_tokens, cost_input, cost_output, supports_vision, supports_function_calling, supports_streaming, updated_at)
VALUES
    -- OpenAI models
    ('openai-gpt-4o', 'openai', 'gpt-4o', 'GPT-4o', 128000, 16384, 0.005, 0.015, 1, 1, 1, strftime('%s', 'now')),
    ('openai-gpt-4o-mini', 'openai', 'gpt-4o-mini', 'GPT-4o Mini', 128000, 16384, 0.00015, 0.0006, 1, 1, 1, strftime('%s', 'now')),
    ('openai-gpt-4-turbo', 'openai', 'gpt-4-turbo', 'GPT-4 Turbo', 128000, 4096, 0.01, 0.03, 1, 1, 1, strftime('%s', 'now')),
    ('openai-o3-mini', 'openai', 'o3-mini', 'o3-mini', 200000, 100000, 0.0011, 0.0044, 0, 1, 1, strftime('%s', 'now')),

    -- Anthropic models
    ('anthropic-claude-sonnet-4-5', 'anthropic', 'claude-sonnet-4-5-20250929', 'Claude Sonnet 4.5', 200000, 8192, 0.003, 0.015, 1, 1, 1, strftime('%s', 'now')),
    ('anthropic-claude-sonnet-4', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', 200000, 8192, 0.003, 0.015, 1, 1, 1, strftime('%s', 'now')),
    ('anthropic-claude-opus-4', 'anthropic', 'claude-opus-4-20250514', 'Claude Opus 4', 200000, 8192, 0.015, 0.075, 1, 1, 1, strftime('%s', 'now')),
    ('anthropic-claude-haiku-3-5', 'anthropic', 'claude-3-5-haiku-20241022', 'Claude 3.5 Haiku', 200000, 8192, 0.001, 0.005, 1, 1, 1, strftime('%s', 'now')),

    -- 百炼 models
    ('bailian-qwen-max', 'bailian', 'qwen-max', '通义千问 Max', 32000, 8192, 0.04, 0.12, 1, 1, 1, strftime('%s', 'now')),
    ('bailian-qwen-plus', 'bailian', 'qwen-plus', '通义千问 Plus', 32000, 8192, 0.004, 0.012, 1, 1, 1, strftime('%s', 'now')),
    ('bailian-qwen-turbo', 'bailian', 'qwen-turbo', '通义千问 Turbo', 32000, 8192, 0.002, 0.006, 1, 1, 1, strftime('%s', 'now')),

    -- 火山方舟 models
    ('volcengine-doubao-pro', 'volcengine', 'doubao-pro-32k', '豆包 Pro', 32000, 4096, 0.0008, 0.002, 1, 1, 1, strftime('%s', 'now')),
    ('volcengine-doubao-lite', 'volcengine', 'doubao-lite-32k', '豆包 Lite', 32000, 4096, 0.0003, 0.0006, 1, 1, 1, strftime('%s', 'now')),

    -- MiniMax models
    ('minimax-abab6-5', 'minimax', 'abab6.5s-chat', 'abab 6.5s', 32000, 8192, 0.001, 0.001, 1, 1, 1, strftime('%s', 'now'));

-- =============================================================================
-- 3. Seed Tools (built-in tools)
-- =============================================================================

INSERT OR IGNORE INTO tools (name, display_name, description, category, is_local, created_at)
VALUES
    ('search', '网络搜索', '使用 Google 搜索获取实时信息', 'utility', 1, strftime('%s', 'now')),
    ('file-editor', '文件编辑器', '读取、写入、编辑项目文件', 'development', 1, strftime('%s', 'now')),
    ('terminal', '终端', '执行 Shell 命令', 'development', 1, strftime('%s', 'now')),
    ('web-fetch', '网页抓取', '获取并解析网页内容', 'utility', 1, strftime('%s', 'now'));

-- =============================================================================
-- 4. Seed Skills (built-in skills)
-- =============================================================================

INSERT OR IGNORE INTO skills (name, display_name, description, category, is_local, slug, version, created_at)
VALUES
    ('commit', 'Git 提交助手', '自动生成 commit message 并推送', 'development', 1, 'commit', '1.0.0', strftime('%s', 'now')),
    ('review-pr', 'PR 审查助手', '审查 Pull Request 并提供反馈', 'development', 1, 'review-pr', '1.0.0', strftime('%s', 'now')),
    ('pdf', 'PDF 处理', '读取和分析 PDF 文档', 'utility', 1, 'pdf', '1.0.0', strftime('%s', 'now'));

-- =============================================================================
-- 5. Seed a Demo OPC (development team)
-- =============================================================================

INSERT OR IGNORE INTO opc_config (
    id, name, display_name, description, avatar_color, avatar_initials,
    is_active, agent_count, channel_count, created_at, updated_at, office_id
)
VALUES (
    'dev-team-001',
    'develop',
    '开发团队',
    '负责产品研发和技术实现的团队',
    '#3B82F6',
    'DT',
    1, 0, 0, strftime('%s', 'now'), strftime('%s', 'now'), 'local-dev'
);

-- =============================================================================
-- 6. Seed Demo Agents for the development team
-- =============================================================================

INSERT OR IGNORE INTO agents (
    id, opc_id, name, display_name, job_title, personality, initials,
    gradient_start, gradient_end, is_default, order_index,
    model, enabled_tools, disabled_tools, enabled_skills,
    reports_to, manages, created_at, updated_at
)
VALUES
    (
        'agent-pm-001',
        'dev-team-001',
        'product-manager',
        '产品助理',
        '产品经理',
        '细心、有条理、善于分析和规划',
        'PM',
        '#60A5FA',
        '#3B82F6',
        1, 1,
        'anthropic-claude-sonnet-4-5',
        '["search", "file-editor"]',
        '[]',
        '[]',
        '[]',
        '[]',
        strftime('%s', 'now'),
        strftime('%s', 'now')
    ),
    (
        'agent-dev-001',
        'dev-team-001',
        'developer',
        '开发工程师',
        '软件工程师',
        '严谨、专注、追求代码质量',
        'DEV',
        '#34D399',
        '#10B981',
        0, 2,
        'anthropic-claude-sonnet-4-5',
        '["file-editor", "terminal", "web-fetch"]',
        '[]',
        '["commit"]',
        '["agent-pm-001"]',
        '[]',
        strftime('%s', 'now'),
        strftime('%s', 'now')
    ),
    (
        'agent-qa-001',
        'dev-team-001',
        'tester',
        '测试工程师',
        'QA Engineer',
        '细致、善于发现问题',
        'QA',
        '#F472B6',
        '#EC4899',
        0, 3,
        'anthropic-claude-sonnet-4-5',
        '["file-editor", "terminal"]',
        '[]',
        '[]',
        '["agent-dev-001"]',
        '[]',
        strftime('%s', 'now'),
        strftime('%s', 'now')
    );

-- Update agent counts
UPDATE opc_config SET agent_count = 3 WHERE id = 'dev-team-001';

-- =============================================================================
-- 7. Seed Agent Documents (SOUL, IDENTITY, etc.)
-- =============================================================================

-- PM Agent documents
INSERT OR IGNORE INTO agent_documents (agent_id, document_type, content)
VALUES
    ('agent-pm-001', 'soul', '你是产品助理，负责理解用户需求、拆解任务、协调团队工作。你细心、有条理，善于将复杂问题结构化。'),
    ('agent-pm-001', 'identity', '## 角色定位\n你是开发团队的产品经理助理，协助主产品经理完成需求分析和任务拆解。'),
    ('agent-pm-001', 'agents', '## 团队关系\n- 汇报对象：用户\n- 协作：developer（任务分配）、tester（进度同步）'),
    ('agent-pm-001', 'user', '## 用户画像\n- 角色：产品负责人/项目经理\n- 期望：高效完成需求拆解和任务分配'),
    ('agent-pm-001', 'tools', '## 可用工具\n- search: 网络搜索\n- file-editor: 编辑产品文档');

-- Dev Agent documents
INSERT OR IGNORE INTO agent_documents (agent_id, document_type, content)
VALUES
    ('agent-dev-001', 'soul', '你是开发工程师，负责将产品需求转化为代码实现。你严谨、专注，追求代码质量和可维护性。'),
    ('agent-dev-001', 'identity', '## 角色定位\n你是开发团队的软件工程师，负责功能开发和代码实现。'),
    ('agent-dev-001', 'agents', '## 团队关系\n- 汇报对象：product-manager\n- 协作：tester（配合测试）'),
    ('agent-dev-001', 'user', '## 用户画像\n- 角色：产品负责人\n- 期望：高质量完成开发任务'),
    ('agent-dev-001', 'tools', '## 可用工具\n- file-editor: 代码编辑\n- terminal: 运行命令\n- commit: Git 提交');

-- QA Agent documents
INSERT OR IGNORE INTO agent_documents (agent_id, document_type, content)
VALUES
    ('agent-qa-001', 'soul', '你是测试工程师，负责发现和报告问题。你细致、善于发现边界情况和潜在问题。'),
    ('agent-qa-001', 'identity', '## 角色定位\n你是开发团队的 QA 工程师，负责质量保证和问题发现。'),
    ('agent-qa-001', 'agents', '## 团队关系\n- 汇报对象：developer\n- 协作：向 developer 反馈问题'),
    ('agent-qa-001', 'user', '## 用户画像\n- 角色：产品负责人\n- 期望：确保产品质量');

-- =============================================================================
-- 8. Seed a Feishu Channel
-- =============================================================================

INSERT OR IGNORE INTO channels (opc_id, channel_type, is_enabled, created_at, updated_at)
VALUES
    ('dev-team-001', 'feishu', 1, strftime('%s', 'now'), strftime('%s', 'now'));

-- Get the channel_id we just inserted
-- Then seed a binding
INSERT OR IGNORE INTO bindings (
    id, opc_id, channel_id, channel_name, channel_type,
    agent_id, agent_name, trigger_mode, is_enabled, created_at, updated_at
)
VALUES (
    'binding-001',
    'dev-team-001',
    '1',
    '开发测试群',
    'group',
    'agent-pm-001',
    'product-manager',
    'mention',
    1,
    strftime('%s', 'now'),
    strftime('%s', 'now')
);

-- Update channel count
UPDATE opc_config SET channel_count = 1 WHERE id = 'dev-team-001';

-- =============================================================================
-- Done
-- =============================================================================

EOF

if [ $? -eq 0 ]; then
    echo "✓ Seed data inserted successfully!"
    echo ""
    echo "Seeded data:"
    echo "  - 5 model providers (OpenAI, Anthropic, 百炼，火山，MiniMax)"
    echo "  - 16 popular models"
    echo "  - 4 built-in tools"
    echo "  - 3 built-in skills"
    echo "  - 1 demo OPC (develop - 开发团队)"
    echo "  - 3 demo agents (PM, Developer, QA)"
    echo "  - Agent documents (SOUL, IDENTITY, etc.)"
    echo "  - 1 Feishu channel binding"
    echo ""
    echo "You can now start the development server and explore the UI."
else
    echo "Error: Failed to insert seed data."
    exit 1
fi
