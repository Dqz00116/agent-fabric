# AgentFabric Task CLI

AgentFabric 实施计划的任务管理命令行工具。

## 📦 安装

```bash
cd cli
npm install
```

或者在 plans 目录使用快捷脚本（会自动安装依赖）：

```bash
# Windows
task.bat mvp_v1 progress

# Linux/Mac
./task.sh mvp_v1 progress
```

## 🚀 快速开始

```bash
# 查看所有计划项目
node cli/task.js plans

# 查看 mvp_v1 进度
node cli/task.js progress mvp_v1

# 列出 mvp_v1 所有任务
node cli/task.js list mvp_v1

# 开始任务
node cli/task.js start mvp_v1 TASK-001

# 完成任务
node cli/task.js done mvp_v1 TASK-001
```

## 📋 命令列表

### 查看计划

```bash
# 列出所有计划项目
node cli/task.js plans
```

### 查看任务

```bash
# 列出所有任务
node cli/task.js list mvp_v1

# 按阶段过滤
node cli/task.js list mvp_v1 --phase phase_1

# 按状态过滤
node cli/task.js list mvp_v1 --status in_progress

# 按优先级过滤
node cli/task.js list mvp_v1 --priority P0

# 显示任务详情
node cli/task.js show mvp_v1 TASK-001
```

### 更新任务状态

```bash
# 开始任务（自动检查依赖）
node cli/task.js start mvp_v1 TASK-001

# 强制开始（忽略依赖检查）
node cli/task.js start mvp_v1 TASK-001 --force

# 标记完成
node cli/task.js done mvp_v1 TASK-001

# 标记阻塞
node cli/task.js block mvp_v1 TASK-001
```

### 添加新任务

```bash
# 添加简单任务
node cli/task.js add mvp_v1 -t "实现用户登录"

# 添加完整任务
node cli/task.js add mvp_v1 \
  -t "实现用户登录功能" \
  -p "Phase 2" \
  -P "P0" \
  -d "实现基于 JWT 的用户登录认证" \
  --depends "TASK-001,TASK-002" \
  --criteria "支持用户名密码登录
支持 JWT Token 返回
支持密码加密存储" \
  --artifacts "src/routes/auth.ts,src/services/auth.ts"
```

### 归档任务

```bash
# 归档已完成任务（移动到 tasks/done/）
node cli/task.js archive mvp_v1 TASK-001
```

### 查看进度

```bash
# 显示整体进度
node cli/task.js progress mvp_v1

# 快捷命令
node cli/task.js p mvp_v1
```

## 🎨 输出示例

### 列出计划

```
📁 可用计划项目:

┌────────────────────┬──────────────────────────────────────┬──────────┬──────────┐
│ 目录               │ 名称                                 │ 进度     │ 完成率   │
├────────────────────┼──────────────────────────────────────┼──────────┼──────────┤
│ mvp_v1             │ AgentFabric MVP v1 实施计划          │ 10/29    │ 34%      │
└────────────────────┴──────────────────────────────────────┴──────────┴──────────┘

共 1 个计划项目

使用: task <plan-name> <command>
例如: task mvp_v1 progress
```

### 任务列表

```
┌────────────┬──────────┬───────────────────────────────────┬──────────┬─────────────────┐
│ ID         │ 阶段     │ 任务                              │ 优先级   │ 状态            │
├────────────┼──────────┼───────────────────────────────────┼──────────┼─────────────────┤
│ TASK-001   │ Phase 1  │ 项目初始化                        │ P0       │ 🔵 待开始       │
│ TASK-002   │ Phase 1  │ Fastify 框架集成                  │ P0       │ 🟡 进行中       │
│ TASK-003   │ Phase 1  │ 数据库层初始化                    │ P0       │ 🟢 已完成       │
└────────────┴──────────┴───────────────────────────────────┴──────────┴─────────────────┘

共 29 个任务 (mvp_v1)
```

### 进度报告

```
📊 AgentFabric MVP v1 实施计划 进度

总体进度: [██████████████░░░░░░░░░░░░░░░░░░░░░░░░░░] 34.5%
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

## 📝 操作日志

CLI 自动记录所有操作行为，支持审计和追溯。

### 查看日志

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

### 导出报告

```bash
# 导出操作报告
task report mvp_v1

# 指定输出路径
task report mvp_v1 -o ./reports/mvp_v1_report.json
```

报告包含：

- 总操作数
- 状态变更次数
- 新增任务数
- 归档任务数
- 错误次数
- 最近活动记录

### 日志文件

日志存储在 `logs/` 目录：

- `operations.log` - 文本格式日志（人类可读）
- `operations.jsonl` - JSON Lines 格式（便于程序解析）

日志条目格式：

```json
{
  "timestamp": "2026-03-04T14:00:00.000Z",
  "level": "INFO",
  "operation": "STATUS_CHANGE",
  "plan": "mvp_v1",
  "taskId": "TASK-001",
  "user": {
    "username": "developer",
    "hostname": "workstation"
  },
  "details": "pending → in_progress",
  "result": "SUCCESS",
  "metadata": {
    "oldStatus": "pending",
    "newStatus": "in_progress"
  }
}
```

## 🔧 开发

```bash
# 安装依赖
cd cli
npm install

# 测试 CLI
node task.js --help
```

## 📄 文件说明

- `task.js` - CLI 主程序
- `package.json` - 依赖配置
- `README.md` - 使用说明

## 📝 数据结构

CLI 直接操作各计划目录下的 `data.json` 文件：

```json
{
  "meta": {
    "title": "计划标题",
    "total_tasks": 29
  },
  "tasks": [
    {
      "id": "TASK-001",
      "status": "completed",
      "title": "任务标题",
      "description": "任务描述",
      "phase": "Phase 1",
      "priority": "P0",
      "dependencies": [],
      "acceptance_criteria": [],
      "artifacts": []
    }
  ]
}
```

状态值：`pending` | `in_progress` | `completed` | `blocked`
