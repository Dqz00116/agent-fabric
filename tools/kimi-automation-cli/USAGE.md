# Kimi Automation CLI - 使用示例

## 基础使用（推荐）

### 1. 最简单的使用方式

直接使用 TaskMaster 的默认计划：

```bash
cd E:\Agent\agent-fabric\tools\kimi-automation-cli
node dist\index.js run
```

### 2. 查看有哪些计划可用

```bash
node dist\index.js plans
```

### 3. 查看当前计划的执行状态

```bash
node dist\index.js plan
```

### 4. 试运行（不实际执行）

```bash
node dist\index.js run --dry-run
```

## 进阶使用

### 使用特定计划

```bash
node dist\index.js run -p mvp_v1
```

### 调整并发数

```bash
# 5 个并行 Session
node dist\index.js run -j 5

# 单线程（适合资源受限环境）
node dist\index.js run -j 1
```

### 调整超时时间

```bash
# 每个任务最多 1 小时
node dist\index.js run -t 60
```

### 指定工作目录

```bash
node dist\index.js run -d E:\Agent\agent-fabric
```

### 组合参数

```bash
node dist\index.js run \
  -p mvp_v1 \
  -j 5 \
  -t 60 \
  -d E:\Agent\agent-fabric
```

## 使用配置文件

### 创建配置文件

```bash
node dist\index.js init -o my-config.json
```

生成的配置文件：

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

**注意**: 不需要配置 `planName` 和 `planPath`！

### 使用配置文件运行

```bash
node dist\index.js run -c my-config.json
```

### 配置文件 + 命令行参数覆盖

```bash
# 使用配置文件，但覆盖并发数
node dist\index.js run -c my-config.json -j 5
```

## Windows 批处理/PowerShell 使用

### 使用批处理脚本

```bash
start.bat
```

或带参数：

```bash
start.bat -j 5 -t 60
```

### 使用 PowerShell 脚本

```powershell
.\kimi-auto.ps1 run
.\kimi-auto.ps1 plan
.\kimi-auto.ps1 plans
```

带参数：

```powershell
.\kimi-auto.ps1 run -j 5 -t 60
```

## 完整工作流示例

### 场景 1：日常开发任务执行

```bash
# 1. 查看当前状态
node dist\index.js plan

# 2. 试运行，确认要执行的任务
node dist\index.js run --dry-run

# 3. 正式启动（使用默认配置）
node dist\index.js run
```

### 场景 2：夜间批量构建

创建 `nightly-build.bat`：

```batch
@echo off
cd E:\Agent\agent-fabric\tools\kimi-automation-cli
node dist\index.js run -j 3 -t 120 > nightly.log 2>&1
```

然后使用 Windows 任务计划程序定时执行。

### 场景 3：多计划切换

```bash
# 查看所有计划
node dist\index.js plans

# 执行 MVP v1 计划
node dist\index.js run -p mvp_v1

# 执行 V2 计划（如果配置了）
node dist\index.js run -p v2_plan
```

## 环境变量

可以通过环境变量配置：

```powershell
# PowerShell
$env:KIMI_AUTO_PLAN_NAME = "mvp_v1"
$env:KIMI_AUTO_MAX_CONCURRENCY = "5"
$env:KIMI_AUTO_TIMEOUT = "3600000"

node dist\index.js run
```

```batch
# CMD
set KIMI_AUTO_MAX_CONCURRENCY=5
set KIMI_AUTO_TIMEOUT=3600000

node dist\index.js run
```

## 故障排查

### 查看详细的执行计划

```bash
node dist\index.js plan
```

### 检查 TaskMaster 配置

```bash
cd E:\Agent\agent-fabric\docs\plans\taskmaster-skill
type config.json
```

### 手动验证 TaskMaster 命令

```bash
cd E:\Agent\agent-fabric\docs\plans\taskmaster-skill
node cli\task.js progress mvp_v1
node cli\task.js list mvp_v1
```
