# TaskMaster Skill - AgentFabric 任务管理

> 通过命令行工具管理实施计划任务，追踪进度，确保项目按计划推进。

---

## 🎯 简介

TaskMaster 是一套标准化的任务管理 Skill，帮助智能体：

1. **查看任务** - 了解当前计划、任务列表、任务详情
2. **追踪进度** - 查看整体进度、阶段进度、待办任务
3. **更新状态** - 开始任务、完成任务、标记阻塞
4. **添加任务** - 动态添加新任务到计划中，自动生成任务文档
5. **归档任务** - 完成的任务归档管理

---

## 📁 前置条件

### 1. 确定计划目录

首先确认当前工作目录下是否存在计划项目：

```bash
# 查看 plans 目录下的计划项目
ls docs/plans/
```

典型的计划项目结构：

```
docs/plans/
├── taskmaster-skill/     # 本 Skill 目录
│   ├── cli/              # CLI 工具
│   │   ├── task.js       # 主程序
│   │   ├── logger.js     # 操作日志模块
│   │   └── ...
│   ├── logs/             # 操作日志（自动生成）
│   │   ├── operations.log      # 文本格式日志
│   │   └── operations.jsonl    # JSON Lines 格式
│   ├── task.bat          # Windows 快捷脚本
│   ├── task.sh           # Linux/Mac 快捷脚本
│   ├── SKILL.md          # 本文档
│   ├── EXAMPLES.md       # 使用示例
│   └── TEMPLATES.md      # 命令模板
│
└── mvp_v1/               # 计划项目示例
    ├── data.json         # 任务数据（纯 JSON 存储）
    └── README.md         # 计划说明
```

> **⭐ 重要**：任务数据**完全存储在 `data.json` 中**，不再使用 Markdown 文档。归档通过设置 `archived: true` 字段完成，无需文件移动。

### 2. CLI 路径

CLI 位于 `taskmaster-skill/cli/` 目录，使用方式：

```bash
# 从 plans 目录使用
cd docs/plans

# Windows
taskmaster-skill\task.bat <command>

# Linux/Mac
./taskmaster-skill/task.sh <command>

# 或进入 skill 目录使用
cd taskmaster-skill
./task.bat <command>
```

### 3. 配置文件

CLI 使用 `config.json` 管理计划项目的路径配置：

```json
{
  "version": "1.0.0",
  "plans": {
    "mvp_v1": {
      "path": "E:\\Agent\\agent-fabric\\docs\\plans\\mvp_v1",
      "description": "AgentFabric MVP v1 实施计划"
    }
  },
  "settings": {
    "defaultPlan": "mvp_v1",
    "autoCreatePlan": false,
    "logRetentionDays": 30
  }
}
```

**配置管理命令**：

```bash
# 查看配置
task config list

# 添加计划
task config add mvp_v2 E:\projects\mvp_v2 --description "MVP v2"

# 移除计划
task config remove mvp_v2

# 设置默认计划
task config set-default mvp_v1
```

> **优点**：计划项目可以存储在任意位置，不受目录结构限制！

---

## 🚀 核心命令

### 1. 查看所有计划

**使用场景**：首次进入项目，了解有哪些实施计划

```bash
# 列出所有计划项目
task plans

# 输出示例：
📁 可用计划项目:

┌────────────────────┬─────────────────────────────┬──────────┬──────────┐
│ 目录               │ 名称                        │ 进度     │ 完成率   │
├────────────────────┼─────────────────────────────┼──────────┼──────────┤
│ mvp_v1             │ AgentFabric MVP v1 实施计划 │ 10/29    │ 34%      │
└────────────────────┴─────────────────────────────┴──────────┴──────────┘
```

### 2. 查看整体进度

**使用场景**：每日站会前、周总结时，了解项目整体状态

```bash
# 查看指定计划的进度
task progress <plan>

# 示例
task progress mvp_v1

# 输出示例：
📊 AgentFabric MVP v1 实施计划 进度

总体进度: [████████████░░░░░░░░░░░░░░░░░░░░] 34.5%
          10/29 任务完成

状态分布:
  🟢 已完成:   10
  🟡 进行中:   5
  🔵 待开始:   12
  🔴 已阻塞:   2

阶段进度:
  基础架构 [████████████████████████████░░░░] 83% (5/6)
  接入层   [████████████░░░░░░░░░░░░░░░░░░░░] 40% (2/5)
  ...

🔥 待办 P0 任务:
  ✓ TASK-015: MCP Adapter 实现
  ○ TASK-017: 编排器核心
```

### 3. 列出任务

**使用场景**：查看任务列表，筛选特定状态或优先级的任务

```bash
# 列出所有任务
task list <plan>

# 按阶段过滤
task list <plan> --phase phase_1

# 按状态过滤
task list <plan> --status pending
task list <plan> --status in_progress
task list <plan> --status completed

# 按优先级过滤
task list <plan> --priority P0
task list <plan> --priority P1

# 组合过滤
task list mvp_v1 --phase phase_1 --priority P0 --status pending
```

### 4. 查看任务详情

**使用场景**：开始任务前，了解任务具体内容、验收标准、依赖关系

```bash
task show <plan> <task-id>

# 示例
task show mvp_v1 TASK-001

# 输出包含：
# - 任务描述
# - 阶段、优先级、状态
# - 依赖任务（及完成状态）
# - 验收标准
# - 输出产物
```

### 5. 开始任务

**使用场景**：准备开始一个新任务

```bash
task start <plan> <task-id>

# 示例
task start mvp_v1 TASK-005

# 自动检查：
# - 依赖任务是否已完成
# - 未完成会提示，可使用 --force 强制开始

# 强制开始（忽略依赖检查）
task start mvp_v1 TASK-005 --force
```

**最佳实践**：

- 开始任务前先查看详情，确认依赖已完成
- 不要强制开始，除非有特殊原因

### 6. 完成任务

**使用场景**：任务验收标准全部达成后

```bash
task done <plan> <task-id>

# 示例
task done mvp_v1 TASK-005

# 完成后会提示归档
```

**完成任务前检查清单**：

- [ ] 所有验收标准已满足
- [ ] 代码已提交
- [ ] 测试已通过
- [ ] 文档已更新

### 7. 归档任务 ⭐

**使用场景**：任务完成后，将任务标记为归档状态

```bash
task archive <plan> <task-id>

# 示例
task archive mvp_v1 TASK-005

# 会设置 archived: true，任务不再默认显示
```

**说明**：

- 归档通过设置 `archived: true` 实现，无需移动文件
- 已归档任务默认不显示在列表中
- 使用 `--archived` 选项查看已归档任务

### 取消归档

```bash
task unarchive <plan> <task-id>

# 示例
task unarchive mvp_v1 TASK-005
```

### 8. 标记阻塞

**使用场景**：任务因外部依赖或其他原因无法继续

```bash
task block <plan> <task-id>

# 示例
task block mvp_v1 TASK-010
```

**标记阻塞时建议**：

- 在任务文档中说明阻塞原因
- 记录预计解决时间
- 通知相关人员

### 9. 添加新任务 ⭐

**使用场景**：计划变更，需要新增任务

#### 基础用法

```bash
# 最小化添加（必填：标题）
task add <plan> -t "任务标题"

# 示例
task add mvp_v1 -t "实现用户登录功能"
```

#### 完整用法

```bash
task add <plan> \
  -t "任务标题" \
  -p "Phase 1" \
  -P "P0" \
  -d "任务描述" \
  --depends "TASK-001,TASK-002" \
  --criteria "标准1\n标准2\n标准3" \
  --artifacts "file1.ts,file2.ts" \
  --background "任务背景说明" \
  --goals "任务目标" \
  --tech "技术要求" \
  --steps "步骤1\n步骤2\n步骤3" \
  --notes "备注信息" \
  --references "参考资料"

# 实际示例
task add mvp_v1 \
  -t "实现 JWT 认证中间件" \
  -p "Phase 2" \
  -P "P0" \
  -d "实现基于 JWT 的 API 认证中间件，保护敏感接口" \
  --depends "TASK-002,TASK-007" \
  --criteria "支持 Bearer Token 解析
支持 Token 过期验证
支持刷新 Token 机制
错误返回 401" \
  --artifacts "src/middleware/auth.ts,src/services/jwt.ts" \
  --background "当前 API 缺乏认证保护，需要添加 JWT 认证" \
  --goals "实现安全的 API 认证机制
支持 Token 自动刷新" \
  --tech "使用 jsonwebtoken 库
RS256 算法签名
Token 有效期 2 小时" \
  --steps "安装依赖
实现 Token 生成
实现验证中间件
添加刷新接口
编写测试" \
  --notes "注意处理时钟偏移问题" \
  --references "https://jwt.io/introduction"
```

#### 参数说明

| 参数            | 简写 | 说明                 | 必填 | 默认值  |
| --------------- | ---- | -------------------- | ---- | ------- |
| `--title`       | `-t` | 任务标题             | ✅   | -       |
| `--phase`       | `-p` | 所属阶段             | ❌   | Phase 1 |
| `--priority`    | `-P` | 优先级 P0/P1/P2      | ❌   | P1      |
| `--description` | `-d` | 任务描述             | ❌   | -       |
| `--depends`     | -    | 依赖任务（逗号分隔） | ❌   | -       |
| `--criteria`    | -    | 验收标准（换行分隔） | ❌   | -       |
| `--artifacts`   | -    | 输出产物（逗号分隔） | ❌   | -       |
| `--background`  | -    | 任务背景             | ❌   | -       |
| `--goals`       | -    | 任务目标             | ❌   | -       |
| `--tech`        | -    | 技术要求             | ❌   | -       |
| `--steps`       | -    | 实现步骤（换行分隔） | ❌   | -       |
| `--notes`       | -    | 备注                 | ❌   | -       |
| `--references`  | -    | 参考资料             | ❌   | -       |

### 10. 查看操作日志 ⭐

**使用场景**：审计操作历史、排查问题、追溯行为

```bash
# 查看最近 20 条日志
task logs

# 查看最近 50 条日志
task logs -n 50

# 按计划过滤
task logs -p mvp_v1

# 按操作类型过滤
task logs -o STATUS_CHANGE
```

**日志包含信息**：

- 时间戳
- 操作用户
- 操作类型（STATUS_CHANGE, TASK_ADDED, TASK_ARCHIVED 等）
- 计划名称
- 任务ID
- 操作详情
- 执行结果

### 11. 导出操作报告 ⭐

**使用场景**：周总结、项目复盘、管理汇报

```bash
# 导出操作报告
task report mvp_v1

# 指定输出路径
task report mvp_v1 -o ./reports/mvp_v1_weekly.json
```

**报告内容**：

```json
{
  "generatedAt": "2026-03-04T14:00:00.000Z",
  "plan": "mvp_v1",
  "summary": {
    "totalOperations": 45,
    "statusChanges": 12,
    "tasksAdded": 3,
    "tasksArchived": 10,
    "errors": 0
  },
  "recentActivity": [...]
}
```

#### 自动生成内容

执行 `task add` 后会自动：

1. **更新 data.json**
   - 添加任务数据到 tasks 数组
   - 更新总任务数

2. **生成任务文档**
   - 根据模板生成 Markdown 文件
   - 保存到 `tasks/TASK-XXX_任务标题.md`
   - 包含所有提供的详细信息

3. **输出提示**

   ```
   ✅ 任务 TASK-030 已创建
      标题: 实现 JWT 认证中间件
      阶段: Phase 2
      优先级: P0

   📄 文档: mvp_v1/tasks/TASK-030_实现_jwt_认证中间件.md

   🔗 依赖: TASK-002, TASK-007
   ```

#### 任务文档模板

生成的任务文档基于模板 `templates/task-template.md`，包含：

- Frontmatter（ID、阶段、标题、优先级等）
- 任务描述
- 背景和目标（如提供）
- 验收标准
- 技术要求（如提供）
- 实现步骤（如提供）
- 输出产物清单
- 依赖项
- 参考资料（如提供）
- 执行记录表

---

## 📋 工作流程

### 每日工作流

```bash
# 1. 查看今日可开始的 P0 任务
task list mvp_v1 --priority P0 --status pending

# 2. 检查任务详情（确认依赖已就绪）
task show mvp_v1 TASK-XXX

# 3. 开始任务
task start mvp_v1 TASK-XXX

# 4. 工作完成后，标记完成
task done mvp_v1 TASK-XXX

# 5. 归档任务文档
task archive mvp_v1 TASK-XXX
```

### 周总结工作流

```bash
# 1. 查看整体进度
task progress mvp_v1

# 2. 查看本周操作记录
task logs -p mvp_v1 -n 50

# 3. 导出本周操作报告
task report mvp_v1 -o ./reports/weekly.json

# 4. 查看进行中的任务
task list mvp_v1 --status in_progress

# 5. 规划下周任务
task list mvp_v1 --status pending --priority P0
```

### 审计追溯工作流

```bash
# 查看特定任务的操作历史
task logs -p mvp_v1 -o STATUS_CHANGE | grep TASK-001

# 导出完整操作报告
task report mvp_v1 -o ./audit/mvp_v1_full.json
```

### 工作流示例（原始）

```bash
# 1. 查看整体进度
task progress mvp_v1

# 2. 查看本周完成的任务
task list mvp_v1 --status completed

# 3. 查看进行中的任务
task list mvp_v1 --status in_progress

# 4. 规划下周任务
task list mvp_v1 --status pending --priority P0
```

### 新增需求工作流

```bash
# 1. 评估需求，确定阶段和优先级

# 2. 添加新任务
task add mvp_v1 \
  -t "新功能实现" \
  -p "Phase 3" \
  -P "P1" \
  -d "详细描述" \
  --depends "TASK-XXX" \
  --criteria "标准1\n标准2" \
  --artifacts "src/xxx.ts"

# 3. 查看生成的任务文档
# 编辑完善细节

# 4. 安排开发计划
task list mvp_v1 --phase phase_3
```

---

## 💡 最佳实践

### 1. 任务粒度

- 每个任务应该在 1-2 天内完成
- 任务过大应该拆分为子任务
- 使用 `task add` 动态添加子任务

### 2. 依赖管理

- 开始任务前务必检查依赖
- 不要强行开始依赖未完成的任务
- 及时更新依赖任务的状态

### 3. 状态流转

```
pending → in_progress → completed → archived
    ↓
  blocked (特殊情况)
```

### 4. 优先级策略

- **P0**：必须在当前阶段完成，阻塞其他任务
- **P1**：重要任务，建议在阶段内完成
- **P2**：可选任务，时间允许时完成

### 5. 归档管理

- 完成任务后立即归档
- 保持 `tasks/` 目录只包含活跃任务
- 便于快速定位当前工作

### 6. 任务文档编写

使用 `task add` 时尽量提供完整信息：

- 清晰的描述和背景
- 具体的验收标准
- 预期的输出产物
- 必要的技术要求

### 7. 日志管理与审计

**定期查看日志**：

```bash
# 每日工作结束前查看操作记录
task logs -p mvp_v1 -n 20
```

**导出周报告**：

```bash
# 每周五导出操作报告
task report mvp_v1 -o ./reports/week_$(date +%W).json
```

**追溯问题**：

```bash
# 查看特定时间段的操作
task logs -p mvp_v1 | grep "2026-03-04"
```

**日志保留**：

- `logs/operations.log` - 文本日志，便于人类阅读
- `logs/operations.jsonl` - 结构化日志，便于程序分析
- 日志文件自动追加，不会覆盖历史记录

---

## 🔧 故障排除

### CLI 未找到

```bash
# 确认路径正确
cd docs/plans/taskmaster-skill
ls cli/task.js

# 安装依赖
cd cli && npm install
```

### 数据文件错误

```bash
# 检查 data.json 是否存在
ls mvp_v1/data.json

# 验证 JSON 格式
node -e "JSON.parse(require('fs').readFileSync('mvp_v1/data.json'))"
```

### 权限问题（Linux/Mac）

```bash
chmod +x taskmaster-skill/task.sh
chmod +x taskmaster-skill/cli/task.js
```

---

## 📊 数据格式

任务数据完全存储在 `data.json` 中，**无需 Markdown 文档**：

```json
{
  "meta": {
    "title": "计划标题",
    "total_tasks": 29
  },
  "tasks": [
    {
      "id": "TASK-001",
      "phase": "Phase 1",
      "title": "任务标题",
      "description": "任务描述",
      "hours": 4,
      "priority": "P0",
      "status": "completed",
      "archived": false,
      "archived_at": null,
      "created_at": "2026-03-04T00:00:00.000Z",
      "updated_at": "2026-03-04T12:00:00.000Z",
      "dependencies": [],
      "acceptance_criteria": [],
      "artifacts": [],
      "content": {
        "background": "任务背景",
        "goals": "任务目标",
        "technical_requirements": "技术要求",
        "implementation_steps": ["步骤1", "步骤2"],
        "notes": "备注",
        "references": "参考资料"
      }
    }
  ]
}
```

### 字段说明

| 字段                  | 类型    | 说明                                        |
| --------------------- | ------- | ------------------------------------------- |
| `id`                  | string  | 任务ID，如 TASK-001                         |
| `phase`               | string  | 所属阶段                                    |
| `title`               | string  | 任务标题                                    |
| `description`         | string  | 任务描述                                    |
| `hours`               | number  | 预估工时                                    |
| `priority`            | string  | 优先级：P0/P1/P2                            |
| `status`              | string  | 状态：pending/in_progress/completed/blocked |
| `archived`            | boolean | 是否归档                                    |
| `archived_at`         | string  | 归档时间（ISO 格式）                        |
| `created_at`          | string  | 创建时间                                    |
| `updated_at`          | string  | 更新时间                                    |
| `dependencies`        | array   | 依赖任务ID列表                              |
| `acceptance_criteria` | array   | 验收标准                                    |
| `artifacts`           | array   | 输出产物                                    |
| `content`             | object  | 详细内容（背景、目标、技术要求等）          |

]
}

````

状态值：`pending` | `in_progress` | `completed` | `blocked`

---

## 📝 示例对话

### 示例 1：开始新任务

**用户**：我准备开始开发数据库模块

**智能体**：
```bash
# 先查看有哪些待办的数据库相关任务
task list mvp_v1 --status pending | grep -i database

# 显示 TASK-003 详情
task show mvp_v1 TASK-003

# 确认依赖已完成，开始任务
task start mvp_v1 TASK-003
````

### 示例 2：任务完成

**用户**：数据库初始化完成了

**智能体**：

```bash
# 标记完成
task done mvp_v1 TASK-003

# 归档
task archive mvp_v1 TASK-003

# 查看进度
task progress mvp_v1
```

### 示例 3：添加新任务

**用户**：需要加一个缓存预热功能

**智能体**：

```bash
# 添加新任务
task add mvp_v1 \
  -t "实现缓存预热功能" \
  -p "Phase 4" \
  -P "P1" \
  -d "在应用启动时预加载热点数据到 Redis" \
  --depends "TASK-004" \
  --criteria "启动时自动预热
支持配置预热策略
预热失败不影响启动" \
  --artifacts "src/services/cache-warmer.ts"

# 查看新任务
task show mvp_v1 TASK-030
```

---

## 🔗 相关资源

- CLI 源码：`taskmaster-skill/cli/task.js`
- CLI 文档：`taskmaster-skill/cli/README.md`
- 使用示例：`taskmaster-skill/EXAMPLES.md`
- 命令模板：`taskmaster-skill/TEMPLATES.md`
- 任务模板：`taskmaster-skill/templates/task-template.md`
- 计划示例：`mvp_v1/`
