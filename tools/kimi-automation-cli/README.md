# Kimi Automation CLI

Kimi CLI 全自动化任务执行工具 - 基于 TaskMaster Skill 实现多 Session 并行任务执行。所有配置通过配置文件管理。

## 功能特性

- **纯配置文件管理**: 所有配置通过 `kimi-auto.config.json` 管理，简化使用
- **任务难度智能评估**: 自动分析任务复杂度，分为 **简单/中等/困难** 三个等级
- **难度模型映射**: 为每个等级配置不同的 Moonshot 模型
- **上下文长度智能评估**: 自动评估任务的上下文需求，超过阈值时自动拆分任务
- **错误400自动继续**: 检测错误400（上下文长度超限），自动发送"继续刚才的任务"继续执行
- **交互式对话自动处理**: 检测 Kimi CLI 的交互请求（确认、输入、选择等），自动响应
- **日志系统**: 为每个 Session 创建独立日志文件，记录完整输出和元数据
- **并行执行**: 支持同时运行多个 Kimi CLI Session

## 安装

```bash
cd tools/kimi-automation-cli
pnpm install
pnpm build
```

## 快速开始

### 1. 初始化配置文件

```bash
kimi-auto init
```

这会创建一个 `kimi-auto.config.json` 文件，包含所有默认配置。

### 2. 查看可用计划

```bash
kimi-auto plans
```

### 3. 启动自动化执行

```bash
kimi-auto run
```

或使用其他配置文件：

```bash
kimi-auto run -c my-config.json
```

### 4. 试运行（不实际执行）

```bash
kimi-auto run --dry-run
```

## 命令列表

| 命令 | 说明 | 参数 |
|------|------|------|
| `init` | 初始化配置文件 | `-o, --output <path>` |
| `run` | 启动自动化执行 | `-c, --config <path>`, `--dry-run` |
| `plan` | 显示执行计划 | `-c, --config <path>`, `--assess-all`, `--difficulty-all` |
| `assess <taskId>` | 评估任务上下文需求 | `-c, --config <path>` |
| `difficulty [taskId]` | 评估任务难度 | `-c, --config <path>` |
| `plans` | 列出 TaskMaster 中所有可用计划 | `-c, --config <path>` |
| `logs` | 查看和管理日志 | `-c, --config <path>`, `--stats`, `--tail <n>`, `--task <taskId>`, `--success`, `--failed` |

## 配置文件

配置文件 `kimi-auto.config.json` 包含所有设置：

```json
{
  "skillPath": "E:\\Agent\\agent-fabric\\docs\\plans\\taskmaster-skill",
  "workDir": "E:\\Agent\\agent-fabric",
  "maxConcurrency": 3,
  "sessionTimeout": 1800000,
  "pollInterval": 5000,
  "kimiCliPath": "kimi",
  "autoApprove": true,
  "maxContextLength": 128000,
  "enableTaskSplit": true,
  "splitThreshold": 0.8,
  "maxRetries": 2,
  "retryDelay": 5000,
  "continueOnError400": true,
  "continuePrompt": "继续刚才的任务",
  "enableDifficultyAssessment": true,
  "difficultyModelMap": {
    "low": {
      "name": "轻量模型",
      "model": "moonshot-v1-8k",
      "maxTokens": 8000,
      "temperature": 0.7,
      "timeout": 600000,
      "description": "适用于简单任务"
    },
    "medium": {
      "name": "标准模型",
      "model": "moonshot-v1-32k",
      "maxTokens": 32000,
      "temperature": 0.7,
      "timeout": 1200000,
      "description": "适用于中等复杂度任务"
    },
    "high": {
      "name": "强力模型",
      "model": "moonshot-v1-128k",
      "maxTokens": 128000,
      "temperature": 0.5,
      "timeout": 2400000,
      "description": "适用于复杂任务"
    }
  },
  "interactionConfig": {
    "enabled": true,
    "autoResponse": "继续执行任务，无需确认",
    "responseDelay": 500,
    "maxInteractions": 5,
    "stdinCloseDelay": 2000,
    "addAntiInteractivePrefix": true
  },
  "loggerConfig": {
    "enabled": true,
    "logDir": "./logs",
    "maxLogFiles": 100,
    "maxLogAge": 30,
    "logLevel": "info",
    "consoleOutput": false
  },
  "promptTemplate": "阅读{{skillPath}}\\SKILL.md这个技能，然后执行第一个可开始的任务",
  "taskSplitPromptTemplate": "这个任务比较复杂，需要拆分成多个部分执行。请先完成以下部分："
}
```

### 配置项说明

#### 基础配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `skillPath` | TaskMaster Skill 路径 | - |
| `workDir` | 工作目录 | - |
| `maxConcurrency` | 最大并发数 | 3 |
| `sessionTimeout` | Session 超时时间（毫秒） | 1800000 |
| `pollInterval` | 状态轮询间隔（毫秒） | 5000 |
| `kimiCliPath` | Kimi CLI 路径 | kimi |
| `autoApprove` | 自动批准 | true |

#### 上下文管理配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `maxContextLength` | 最大上下文长度（tokens） | 128000 |
| `enableTaskSplit` | 启用任务拆分 | true |
| `splitThreshold` | 拆分阈值（0-1） | 0.8 |

#### 错误处理配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `maxRetries` | 最大重试次数 | 2 |
| `retryDelay` | 重试延迟（毫秒） | 5000 |
| `continueOnError400` | 错误400自动继续 | true |
| `continuePrompt` | 继续提示词 | 继续刚才的任务 |

#### 难度模型映射配置

```json
{
  "difficultyModelMap": {
    "low": {
      "name": "轻量模型",
      "model": "moonshot-v1-8k",
      "maxTokens": 8000,
      "temperature": 0.7,
      "timeout": 600000,
      "description": "适用于简单任务"
    },
    "medium": {
      "name": "标准模型",
      "model": "moonshot-v1-32k",
      "maxTokens": 32000,
      "temperature": 0.7,
      "timeout": 1200000,
      "description": "适用于中等复杂度任务"
    },
    "high": {
      "name": "强力模型",
      "model": "moonshot-v1-128k",
      "maxTokens": 128000,
      "temperature": 0.5,
      "timeout": 2400000,
      "description": "适用于复杂任务"
    }
  }
}
```

#### 交互处理配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `interactionConfig.enabled` | 启用交互处理 | true |
| `interactionConfig.autoResponse` | 自动响应内容 | 继续执行任务，无需确认 |
| `interactionConfig.responseDelay` | 响应延迟（毫秒） | 500 |
| `interactionConfig.maxInteractions` | 最大交互次数 | 5 |
| `interactionConfig.stdinCloseDelay` | stdin 关闭延迟（毫秒） | 2000 |
| `interactionConfig.addAntiInteractivePrefix` | 添加防交互前缀 | true |

#### 日志配置

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `loggerConfig.enabled` | 启用日志 | true |
| `loggerConfig.logDir` | 日志目录 | ./logs |
| `loggerConfig.maxLogFiles` | 最大保留文件数 | 100 |
| `loggerConfig.maxLogAge` | 最大保留天数 | 30 |
| `loggerConfig.logLevel` | 日志级别 | info |
| `loggerConfig.consoleOutput` | 同时输出到控制台 | false |

## 工作流程

```
1. 读取 TaskMaster 配置
   └── 从 skillPath/config.json 获取 planName + planPath
        ↓
2. 读取计划文档
   └── data.json → 获取所有任务
        ↓
3. 检查可执行性
   └── 筛选依赖已完成的任务
        ↓
4. 任务难度评估
   └── 计算复杂度得分
       ├── [低] 简单 → 使用 difficultyModelMap.low 模型
       ├── [中] 中等 → 使用 difficultyModelMap.medium 模型
       └── [高] 困难 → 使用 difficultyModelMap.high 模型
        ↓
5. 上下文评估
   └── 预估 tokens
       ├── 超过阈值 → 拆分子任务
       └── 正常 → 直接执行
        ↓
6. 准备提示词
   └── 添加防交互前缀
        ↓
7. 并行启动 Session
   ├── 实时记录 stdout/stderr 到日志文件
   ├── 检测交互请求 → 自动响应
   ├── 正常完成 → 标记完成并保存元数据
   ├── 错误400 → 发送 continuePrompt 继续
   └── 其他错误 → 重试（最多 maxRetries 次）
        ↓
8. 动态调度
   └── Session 完成后立即启动新任务
        ↓
9. 完成报告
   └── 统计成功/失败/拆分/重试/难度分布
```

## 日志系统

### 日志文件结构

每个 Session 生成两个文件：
- `{timestamp}_{taskId}_{sessionId}.log` - 完整输出日志
- `{timestamp}_{taskId}_{sessionId}.meta.json` - 结构化元数据

### 日志命令

```bash
# 查看统计信息
kimi-auto logs --stats

# 列出最近 20 条日志
kimi-auto logs --tail 20

# 查看特定任务
kimi-auto logs --task TASK-016

# 筛选成功/失败
kimi-auto logs --success
kimi-auto logs --failed
```

### 日志内容

**日志文件 (.log)**：
```
========================================
Session Log
========================================
Session ID: kauto-TASK-016-xxx
Task ID: TASK-016
Difficulty: medium
Model: moonshot-v1-32k
----------------------------------------

[2024-01-15T10:30:01.000Z] [OUT] 任务输出内容...
[2024-01-15T10:30:02.000Z] [ERR] 错误信息...
[2024-01-15T10:30:03.000Z] [INFO] 交互响应: confirmation

----------------------------------------
End Time: 2024-01-15T10:35:00.000Z
Duration: 300000ms
Success: true
Interactions: 2
========================================
```

**元数据文件 (.meta.json)**：
```json
{
  "sessionId": "kauto-TASK-016-xxx",
  "taskId": "TASK-016",
  "difficulty": "medium",
  "model": "moonshot-v1-32k",
  "startTime": 1705315800000,
  "endTime": 1705316100000,
  "duration": 300000,
  "success": true,
  "retryCount": 0,
  "interactionCount": 2
}
```

## 难度评估机制

### 评分维度

| 维度 | 权重 | 说明 |
|------|------|------|
| 复杂度 | 30% | 实现步骤数量 |
| 工时 | 25% | 预估工时 |
| 依赖 | 15% | 依赖任务数量 |
| 产物 | 15% | 产物文件数量 |
| 验收标准 | 15% | 验收标准数量 |

### 难度等级

| 等级 | 分数范围 | 标记 | 说明 |
|------|---------|------|------|
| 简单 | 0-25 | [低] | 快速任务，少量步骤 |
| 中等 | 25-50 | [中] | 标准任务，适中复杂度 |
| 困难 | 50+ | [高] | 复杂任务，大量依赖或步骤 |

## 示例场景

### 场景1：修改配置后运行

```bash
# 修改 kimi-auto.config.json 中的配置
# 例如: maxConcurrency: 10

# 运行
kimi-auto run
```

### 场景2：使用不同配置文件

```bash
# 创建生产环境配置
kimi-auto init -o prod.config.json
# 编辑 prod.config.json

# 使用生产配置运行
kimi-auto run -c prod.config.json
```

### 场景3：评估任务难度

```bash
kimi-auto difficulty TASK-016
```

输出：
```
任务难度评估: TASK-016 - Agent 管理 API
难度评估结果:
  难度等级: [中] 中等
  综合得分: 39分
模型配置:
  模型名称: 标准模型
  模型ID: moonshot-v1-32k
  超时时间: 20分钟
```

## 故障排查

### 配置文件未找到

```bash
# 创建默认配置文件
kimi-auto init
```

### 日志查看

```bash
# 查看最新日志
kimi-auto logs --tail 5

# 查看失败的任务
kimi-auto logs --failed

# 查看详细输出
type logs\2024-01-15T10-30-00-000Z_TASK-016_xxx.log
```

### 禁用某个功能

在配置文件中设置：

```json
{
  "enableTaskSplit": false,
  "enableDifficultyAssessment": false,
  "interactionConfig": {
    "enabled": false
  },
  "loggerConfig": {
    "enabled": false
  }
}
```

## 许可证

MIT
