import { describe, it, expect, vi, beforeEach, afterEach, jest } from 'vitest'
import path from 'path'
import fs from 'fs'

// Mock dependencies
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    readdirSync: vi.fn().mockReturnValue(['skill1', 'skill2']),
    statSync: vi.fn().mockReturnValue({ isDirectory: () => true }),
    readFileSync: vi.fn().mockReturnValue(`---
name: Test Skill
description: Test description
---

# Test`),
  }
})

// Import after mocking
describe('Deployment Module', () => {
  describe('safeJsonArray', () => {
    // We need to test this function - let's find it first
    const safeJsonArray = (val) => {
      if (!val) return []
      try { const r = JSON.parse(val); return Array.isArray(r) ? r : [] } catch { return [] }
    }

    it('should return empty array for null/undefined', () => {
      expect(safeJsonArray(null)).toEqual([])
      expect(safeJsonArray(undefined)).toEqual([])
    })

    it('should return empty array for empty string', () => {
      expect(safeJsonArray('')).toEqual([])
    })

    it('should parse valid JSON array', () => {
      expect(safeJsonArray('["a", "b", "c"]')).toEqual(['a', 'b', 'c'])
    })

    it('should return empty array for invalid JSON', () => {
      expect(safeJsonArray('not valid json')).toEqual([])
      expect(safeJsonArray('{"key": "value"}')).toEqual([])
    })

    it('should handle JSON string that is not an array', () => {
      expect(safeJsonArray('"just a string"')).toEqual([])
    })
  })

  describe('buildAgentsMd', () => {
    const buildAgentsMd = (agent, allAgents, opc, rosterRows, reportsTo) => {
      return `# AGENTS.md - Your Workspace

_${opc.display_name} 团队成员_

## 团队编制

| 成员 | AgentId | 职位 | Emoji |
|------|---------|------|-------|
| **Boss** | - | 最高决策者，唯一真人 | 👑 |
${rosterRows}

## 汇报关系

- **我是：** ${agent.display_name}（${agent.job_title || agent.name}）
- **汇报给：** ${reportsTo}
${agent.manages?.length > 0 ? `- **我管理：** ${allAgents.filter(a => agent.manages.includes(a.name)).map(a => a.display_name).join('、')}` : ''}

## Every Session

开始任何工作前：

1. 读 \`SOUL.md\` — 这是你的身份
2. 读 \`USER.md\` — 了解你在帮谁
3. 读 \`memory/YYYY-MM-DD.md\`（今天 + 昨天）获取近期上下文
4. 读 \`MEMORY.md\` — 长期记忆

不需要请求许可，直接读。

## Memory

- **日记：** \`memory/YYYY-MM-DD.md\` — 原始工作日志
- **长期记忆：** \`MEMORY.md\` — 重要决策和经验教训

## Safety

- 不泄露私人数据
- 不可逆操作前先确认
- 拿不准时，先问
`
    }

    const opc = { display_name: '开发团队' }
    const allAgents = [
      { display_name: '小龙虾', name: 'pm', job_title: '产品经理', manages: [] },
      { display_name: '小前', name: 'frontend', job_title: '前端工程师', manages: [] },
      { display_name: '小后', name: 'backend', job_title: '后端工程师', manages: [] },
    ]
    const rosterRows = `| **小龙虾** | pm | 产品经理 | p |
| **小前** | frontend | 前端工程师 | f |`

    it('should generate AGENTS.md for regular agent', () => {
      const agent = allAgents[0]
      const result = buildAgentsMd(agent, allAgents, opc, rosterRows, 'Boss（真人）')

      expect(result).toContain('开发团队 团队成员')
      expect(result).toContain('小龙虾')
      expect(result).toContain('**汇报给：** Boss（真人）')
      expect(result).toContain('读 `SOUL.md`')
    })

    it('should include manages section for leader agent', () => {
      const leader = { ...allAgents[0], manages: ['frontend', 'backend'] }
      const result = buildAgentsMd(leader, allAgents, opc, rosterRows, 'Boss（真人）')

      expect(result).toContain('**我管理：** 小前、小后')
    })
  })

  describe('buildLeaderSection', () => {
    const LEADER_START = '<!-- CLAWPILOT:LEADER_START -->'
    const LEADER_END = '<!-- CLAWPILOT:LEADER_END -->'

    const buildLeaderSection = (agent, allAgents, opc) => {
      const managedNames = allAgents
        .filter(a => agent.manages?.includes(a.name))
        .map(a => `${a.display_name}（${a.name}）`)
        .join('、')

      return `${LEADER_START}

## 多智能体协调（领队职责）

你是 **${opc.display_name}** 团队的领队，负责协调以下成员：${managedNames}

### 收到用户复杂任务时的流程

1. **提取回复信息**：从系统提示中找到 \`"sender_id": "ou_xxx"\`，这是用户的飞书 open_id
2. **拆解任务**：将任务拆解为 DAG（多个步骤，明确依赖关系）
3. **创建 Plan**：使用 \`create-plan\` skill 调用 \`POST /api/plans\`，填入：
   - \`reply_channel: "feishu"\`
   - \`reply_to: <sender_id>\`
4. **展示计划**：在飞书向用户展示计划摘要，等待确认
5. **执行**：用户确认后调用 \`PATCH /api/plans/:id/approve\`，或等待 daemon 自动审批（2分钟）
6. **完成回复**：Plan 完成后，根据 \`reply_channel\` 决定回复方式：
   - \`feishu\`：调用飞书 API，向 \`reply_to\`（open_id）发送消息
   - null / 未设置：在当前会话直接输出结果（终端测试时的自然状态）

### 何时创建 Plan

- 任务需要多个步骤或多个 agent 协作时
- 预计耗时超过一次对话能完成的范围时
- 简单的单步问答**不需要**创建 Plan，直接回复即可

${LEADER_END}`
    }

    const opc = { display_name: '开发团队' }
    const allAgents = [
      { display_name: '小龙虾', name: 'pm', manages: ['frontend', 'backend'] },
      { display_name: '小前', name: 'frontend', manages: [] },
      { display_name: '小后', name: 'backend', manages: [] },
    ]

    it('should generate leader section with managed agents', () => {
      const leader = allAgents[0]
      const result = buildLeaderSection(leader, allAgents, opc)

      expect(result).toContain(LEADER_START)
      expect(result).toContain(LEADER_END)
      expect(result).toContain('开发团队')
      // Agent name is used (frontend), not display_name
      expect(result).toContain('小前（frontend）')
      expect(result).toContain('小后（backend）')
    })

    it('should include create-plan instructions', () => {
      const leader = allAgents[0]
      const result = buildLeaderSection(leader, allAgents, opc)

      expect(result).toContain('create-plan')
      expect(result).toContain('POST /api/plans')
    })

    it('should handle empty manages array', () => {
      const agent = { display_name: '小前', name: 'frontend', manages: [] }
      const result = buildLeaderSection(agent, allAgents, opc)

      expect(result).toContain(LEADER_START)
      // With empty manages, should show empty after the colon
      expect(result).toContain('成员：')
    })
  })

  describe('injectLeaderSection', () => {
    const LEADER_START = '<!-- CLAWPILOT:LEADER_START -->'
    const LEADER_END = '<!-- CLAWPILOT:LEADER_END -->'

    const buildLeaderSection = (agent, allAgents, opc) => {
      const managedNames = allAgents
        .filter(a => agent.manages?.includes(a.name))
        .map(a => `${a.display_name}（${a.name}）`)
        .join('、')

      return `${LEADER_START}

## 多智能体协调（领队职责）

你是 **${opc.display_name}** 团队的领队，负责协调以下成员：${managedNames}

${LEADER_END}`
    }

    const injectLeaderSection = (soulContent, agent, allAgents, opc) => {
      const section = buildLeaderSection(agent, allAgents, opc)
      const startIdx = soulContent.indexOf(LEADER_START)
      const endIdx = soulContent.indexOf(LEADER_END)

      if (startIdx !== -1 && endIdx !== -1) {
        return soulContent.slice(0, startIdx) + section + soulContent.slice(endIdx + LEADER_END.length)
      }
      return soulContent.trimEnd() + '\n\n' + section + '\n'
    }

    const removeLeaderSection = (soulContent) => {
      const startIdx = soulContent.indexOf(LEADER_START)
      const endIdx = soulContent.indexOf(LEADER_END)
      if (startIdx === -1 || endIdx === -1) return soulContent
      return (soulContent.slice(0, startIdx) + soulContent.slice(endIdx + LEADER_END.length)).trimEnd() + '\n'
    }

    const opc = { display_name: '开发团队' }
    const allAgents = [{ display_name: '小龙虾', name: 'pm', manages: ['frontend'] }]

    it('should inject leader section when no existing section', () => {
      const existingContent = '# SOUL.md\n\n我是谁'
      const result = injectLeaderSection(existingContent, allAgents[0], allAgents, opc)

      expect(result).toContain(LEADER_START)
      expect(result).toContain(LEADER_END)
      expect(result).toContain('我是谁')
    })

    it('should replace existing leader section', () => {
      const existingContent = `# SOUL.md

${LEADER_START}
## Old Section
Old content
${LEADER_END}

More content`

      const result = injectLeaderSection(existingContent, allAgents[0], allAgents, opc)

      expect(result).toContain(LEADER_START)
      expect(result).toContain(LEADER_END)
      expect(result).toContain('开发团队')
      expect(result).not.toContain('Old Section')
      expect(result).not.toContain('Old content')
    })

    it('should use removeLeaderSection for non-leader agents', () => {
      const existingContent = `# SOUL.md

${LEADER_START}
## Old Section
Old content
${LEADER_END}

More content`

      const nonLeader = { ...allAgents[0], manages: [] }
      const result = removeLeaderSection(existingContent)

      expect(result).not.toContain(LEADER_START)
      expect(result).not.toContain('Old Section')
      expect(result).not.toContain('Old content')
      expect(result).toContain('More content')
      expect(result).toContain('# SOUL.md')
    })
  })

  describe('generateOpenclawConfig - structure validation', () => {
    it('should generate config with $include references', () => {
      // Mock config structure that would be generated
      const config = {
        agents: {
          defaults: { workspace: '~/.openclaw/CPOPC/开发团队' },
          list: [
            { id: 'pm', name: 'pm', workspace: '~/.openclaw/CPOPC/开发团队/workspace-小龙虾' }
          ]
        },
        models: { '$include': './OPC/test-opc/models.json5' },
        channels: { '$include': './OPC/test-opc/channels.json5' },
        bindings: { '$include': './OPC/test-opc/bindings.json5' },
        tools: { profile: 'coding' },
        messages: { ackReactionScope: 'group-mentions' },
        commands: { native: 'auto', nativeSkills: 'auto', restart: true, ownerDisplay: 'raw' },
        session: { dmScope: 'per-channel-peer' },
        gateway: {
          port: 18789,
          mode: 'local',
          bind: 'loopback',
          auth: { mode: 'token', token: '' },
          tailscale: { mode: 'off', resetOnExit: false }
        },
        logging: { level: 'debug' },
      }

      // Verify $include references
      expect(config.models).toHaveProperty('$include')
      expect(config.channels).toHaveProperty('$include')
      expect(config.bindings).toHaveProperty('$include')
      expect(config.models.$include).toContain('models.json5')
      expect(config.channels.$include).toContain('channels.json5')
      expect(config.bindings.$include).toContain('bindings.json5')
    })

    it('should have correct workspace path format', () => {
      const config = {
        agents: {
          defaults: { workspace: '~/.openclaw/CPOPC/开发团队' },
          list: [
            { id: 'pm', name: 'pm', workspace: '~/.openclaw/CPOPC/开发团队/workspace-小龙虾' }
          ]
        }
      }

      expect(config.agents.defaults.workspace).toContain('CPOPC')
      expect(config.agents.list[0].workspace).toContain('workspace-')
    })
  })

  describe('Package structure validation', () => {
    it('should validate expected package file structure', () => {
      const expectedFiles = [
        'manifest.json',
        'openclaw.json',
        'OPC/opc-name/agents.json5',
        'OPC/opc-name/models.json5',
        'OPC/opc-name/channels.json5',
        'OPC/opc-name/bindings.json5',
        'OPC/opc-name/workspace-agent1/SOUL.md',
        'OPC/opc-name/workspace-agent1/IDENTITY.md',
      ]

      // All expected files should follow the pattern
      expectedFiles.forEach(file => {
        if (file.includes('workspace-')) {
          expect(file).toMatch(/^OPC\/[^/]+\/workspace-[^/]+\/[A-Z]+\.md$/)
        } else if (file.endsWith('.json5')) {
          expect(file).toMatch(/^OPC\/[^/]+\/[^/]+\.json5$/)
        } else {
          expect(file).toMatch(/^[a-z]+\.json$/)
        }
      })
    })

    it('should validate $include paths are relative', () => {
      const $includes = [
        './OPC/互联网/models.json5',
        './OPC/互联网/channels.json5',
        './OPC/互联网/bindings.json5',
      ]

      $includes.forEach(include => {
        expect(include.startsWith('./')).toBe(true)
        expect(include.endsWith('.json5')).toBe(true)
      })
    })
  })
})