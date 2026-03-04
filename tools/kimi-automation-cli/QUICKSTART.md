# Kimi Automation CLI - 快速开始

## 1. 安装

```bash
cd E:\Agent\agent-fabric\tools\kimi-automation-cli
pnpm install
pnpm build
```

## 2. 查看可用计划

```bash
node dist\index.js plans
```

输出示例：
```
可用计划列表:

  mvp_v1
    路径: E:\Agent\agent-fabric\docs\plans\mvp_v1
    描述: AgentFabric MVP v1 实施计划

共 1 个计划
```

## 3. 查看执行计划（使用默认计划）

```bash
node dist\index.js plan
```

或使用特定计划：
```bash
node dist\index.js plan -p mvp_v1
```

输出示例：
```
执行计划概览
计划: mvp_v1
总进度: 55% (16/29)
运行中: 0, 待处理: 13

可执行任务:
  [就绪] TASK-016 (P0): Agent 管理 API
  [就绪] TASK-018 (P0): 中间件链框架
  [等待依赖] TASK-019 (P0): 核心中间件实现
      依赖: TASK-018
```

## 4. 试运行（不实际执行）

```bash
node dist\index.js run --dry-run
```

## 5. 启动自动化执行

### 基础用法（使用 TaskMaster 默认计划）

```bash
node dist\index.js run
```

### 指定计划

```bash
node dist\index.js run -p mvp_v1
```

### 完整参数

```bash
node dist\index.js run \
  -p mvp_v1 \
  -d E:\Agent\agent-fabric \
  -s E:\Agent\agent-fabric\docs\plans\taskmaster-skill \
  -j 3 \
  -t 30
```

参数说明：
- `-p, --plan`: 计划名称（可选，默认使用 TaskMaster 配置中的 defaultPlan）
- `-d, --work-dir`: 工作目录
- `-s, --skill-path`: TaskMaster Skill 路径
- `-j, --concurrency`: 最大并发数（默认 3）
- `-t, --timeout`: 任务超时时间（分钟，默认 30）
- `--dry-run`: 试运行模式

## 工作流程

```
1. 读取 TaskMaster 配置
   └── config.json → 获取 planName + planPath
        ↓
2. 读取计划文档
   └── data.json → 获取所有任务
        ↓
3. 检查可执行任务（依赖已完成）
        ↓
4. 并行启动 Kimi CLI Session
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │Session 1│ │Session 2│ │Session 3│
   │TASK-016 │ │TASK-018 │ │TASK-010 │
   └─────────┘ └─────────┘ └─────────┘
        ↓
5. 每个 Session 执行流程：
   - 清空上下文 (--session 新 ID)
   - 发送提示词："阅读 SKILL.md，执行第一个可开始的任务"
   - LLM 自动读取技能文档
   - LLM 查询可执行任务
   - LLM 执行：start → done → verify → archive
        ↓
6. Session 完成后自动启动新任务
        ↓
7. 所有任务完成后生成报告
```

## 配置文件（可选）

如果需要自定义配置，可以创建配置文件：

```bash
node dist\index.js init -o kimi-auto.config.json
```

配置文件内容（注意：不需要 planPath 和 planName！）：

```json
{
  "skillPath": "E:\\Agent\\agent-fabric\\docs\\plans\\taskmaster-skill",
  "workDir": "E:\\Agent\\agent-fabric",
  "maxConcurrency": 3,
  "sessionTimeout": 1800000,
  "pollInterval": 5000,
  "kimiCliPath": "kimi",
  "autoApprove": true,
  "promptTemplate": "阅读{{skillPath}}\\SKILL.md这个技能，然后执行第一个可开始的任务"
}
```

`planName` 和 `planPath` 会自动从 TaskMaster 的 `config.json` 中读取！

## 提示词模板

默认模板：
```
阅读{{skillPath}}\SKILL.md这个技能，然后执行第一个可开始的任务
```

可用变量：
- `{{skillPath}}`: TaskMaster Skill 路径
- `{{planName}}`: 计划名称（自动从 TaskMaster 配置读取）
- `{{workDir}}`: 工作目录
- `{{taskId}}`: 任务 ID

## 注意事项

1. **登录 Kimi CLI**：首次使用前需要登录
   ```bash
   kimi login
   ```

2. **上下文隔离**：每个 Session 都是全新的，使用独立的 Session ID

3. **自动批准**：使用 `--yolo` 模式，自动批准所有操作

4. **资源占用**：并行 Session 会占用较多系统资源，建议根据机器配置调整并发数

5. **中断处理**：按 Ctrl+C 可以优雅地停止所有 Session

## 故障排查

### 任务状态不更新

手动检查 TaskMaster：
```bash
cd E:\Agent\agent-fabric\docs\plans\taskmaster-skill
node cli\task.js progress mvp_v1
```

### Session 超时

增加超时时间：
```bash
node dist\index.js run -t 60  # 60分钟
```

### 内存不足

减少并发数：
```bash
node dist\index.js run -j 1  # 单线程
```

### 找不到计划

检查 TaskMaster 中配置的计划：
```bash
node dist\index.js plans
```
