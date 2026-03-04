# TaskMaster Skill 命令模板

> 常用命令的快速复制模板

---

## 📁 路径说明

所有命令基于 `docs/plans` 目录执行：

```bash
cd docs/plans
```

Windows 使用 `taskmaster-skill\task.bat`，Linux/Mac 使用 `./taskmaster-skill/task.sh`

---

## ⚙️ 配置管理

### 查看当前配置

```bash
taskmaster-skill\task.bat config list
```

### 添加计划配置

```bash
taskmaster-skill\task.bat config add <name> <path> --description "描述"

# 示例
taskmaster-skill\task.bat config add mvp_v2 E:\projects\mvp_v2 --description "MVP v2 计划"
```

### 移除计划配置

```bash
taskmaster-skill\task.bat config remove <name>
```

### 设置默认计划

```bash
taskmaster-skill\task.bat config set-default <name>
```

---

## 📊 查看类命令

### 查看所有计划

```bash
taskmaster-skill\task.bat plans
```

### 查看整体进度

```bash
taskmaster-skill\task.bat progress <plan>
```

### 列出所有任务

```bash
taskmaster-skill\task.bat list <plan>
```

### 列出待办任务

```bash
taskmaster-skill\task.bat list <plan> --status pending
```

### 列出进行中任务

```bash
taskmaster-skill\task.bat list <plan> --status in_progress
```

### 列出已完成任务

```bash
taskmaster-skill\task.bat list <plan> --status completed
```

### 列出阻塞任务

```bash
taskmaster-skill\task.bat list <plan> --status blocked
```

### 列出 P0 任务

```bash
taskmaster-skill\task.bat list <plan> --priority P0
```

### 列出指定阶段任务

```bash
taskmaster-skill\task.bat list <plan> --phase phase_1
```

### 组合过滤

```bash
taskmaster-skill\task.bat list <plan> --phase phase_1 --priority P0 --status pending
```

---

## 📋 任务详情

### 查看任务详情

```bash
taskmaster-skill\task.bat show <plan> <task-id>
```

---

## 🚀 状态更新

### 开始任务

```bash
taskmaster-skill\task.bat start <plan> <task-id>
```

### 强制开始（忽略依赖）

```bash
taskmaster-skill\task.bat start <plan> <task-id> --force
```

### 完成任务

```bash
taskmaster-skill\task.bat done <plan> <task-id>
```

### 标记阻塞

```bash
taskmaster-skill\task.bat block <plan> <task-id>
```

### 归档任务

```bash
taskmaster-skill\task.bat archive <plan> <task-id>
```

### 取消归档

```bash
taskmaster-skill\task.bat unarchive <plan> <task-id>
```

### 查看已归档任务

```bash
taskmaster-skill\task.bat list <plan> --archived
```

---

## ➕ 添加任务

### 最小化添加

```bash
taskmaster-skill\task.bat add <plan> -t "任务标题"
```

### 完整添加（Windows）

```batch
taskmaster-skill\task.bat add <plan> ^
  -t "任务标题" ^
  -p "Phase 1" ^
  -P "P0" ^
  -d "任务描述" ^
  --depends "TASK-001,TASK-002" ^
  --criteria "标准1^标准2^标准3" ^
  --artifacts "file1.ts,file2.ts" ^
  --background "任务背景" ^
  --goals "任务目标" ^
  --tech "技术要求" ^
  --steps "步骤1^步骤2^步骤3" ^
  --notes "备注" ^
  --references "参考资料"
```

### 完整添加（Linux/Mac）

```bash
./taskmaster-skill/task.sh add <plan> \
  -t "任务标题" \
  -p "Phase 1" \
  -P "P0" \
  -d "任务描述" \
  --depends "TASK-001,TASK-002" \
  --criteria "标准1
标准2
标准3" \
  --artifacts "file1.ts,file2.ts" \
  --background "任务背景" \
  --goals "任务目标" \
  --tech "技术要求" \
  --steps "步骤1
步骤2
步骤3" \
  --notes "备注" \
  --references "参考资料"
```

---

## ✏️ 编辑任务

### 编辑任务基础信息

```bash
taskmaster-skill\task.bat edit <plan> <task-id> -t "新标题" -d "新描述"
```

### 追加验收标准

```bash
taskmaster-skill\task.bat edit <plan> <task-id> --criteria "新标准1^新标准2"
```

### 追加输出产物

```bash
taskmaster-skill\task.bat edit <plan> <task-id> --artifacts "file3.ts,file4.ts"
```

---

## 🗑️ 删除任务

### 删除任务（需确认）

```bash
taskmaster-skill\task.bat delete <plan> <task-id>
```

### 强制删除

```bash
taskmaster-skill\task.bat delete <plan> <task-id> --force
```

---

## 📜 操作日志

### 查看最近日志

```bash
taskmaster-skill\task.bat logs
taskmaster-skill\task.bat logs -n 50
```

### 按计划过滤

```bash
taskmaster-skill\task.bat logs -p mvp_v1
```

### 按操作类型过滤

```bash
taskmaster-skill\task.bat logs -o STATUS_CHANGE
```

---

## 📊 操作报告

### 导出报告

```bash
taskmaster-skill\task.bat report mvp_v1
taskmaster-skill\task.bat report mvp_v1 -o ./reports/mvp_v1.json
```

---

## 📝 实际替换示例

将以下模板中的占位符替换为实际值：

- `<plan>` → `mvp_v1`
- `<task-id>` → `TASK-001`
- `任务标题` → 具体任务名称
- `Phase 1` → 实际阶段
- `P0` → 实际优先级
- `TASK-001,TASK-002` → 实际依赖任务ID

---

## 🔥 日常快捷键

### Linux/Mac (创建别名)

```bash
alias task='~/projects/agent-fabric/docs/plans/taskmaster-skill/task.sh'
alias tp='task progress mvp_v1'
alias tl='task list mvp_v1'
alias ts='task show mvp_v1'
alias ta='task add mvp_v1'
```

### Windows (创建 task.cmd)

```batch
@echo off
call E:\Agent\agent-fabric\docs\plans\taskmaster-skill\task.bat %*
```

---

## 📊 常用查询组合

### 今日工作清单

```bash
taskmaster-skill\task.bat list mvp_v1 --status in_progress
taskmaster-skill\task.bat list mvp_v1 --status pending --priority P0
```

### 本周完成

```bash
taskmaster-skill\task.bat list mvp_v1 --status completed
```

### 阻塞关注

```bash
taskmaster-skill\task.bat list mvp_v1 --status blocked
```

### 阶段概览（Bash）

```bash
for phase in phase_1 phase_2 phase_3 phase_4 phase_5 phase_6; do
  echo "=== $phase ==="
  taskmaster-skill/task.sh list mvp_v1 --phase $phase --status pending
done
```

---

## 💡 添加任务模板

### 功能开发任务

```bash
task add <plan> \
  -t "实现XXX功能" \
  -p "Phase X" \
  -P "P1" \
  -d "实现XXX功能，支持YYY" \
  --depends "TASK-XXX" \
  --criteria "功能A正常工作
边界情况处理
单元测试覆盖>80%" \
  --artifacts "src/modules/xxx.ts,tests/xxx.test.ts"
```

### Bug 修复任务

```bash
task add <plan> \
  -t "修复XXX问题" \
  -p "Phase X" \
  -P "P0" \
  -d "修复生产环境的XXX问题" \
  --criteria "定位问题根因
实现修复方案
回归测试通过" \
  --artifacts "src/bugfix/xxx.ts"
```

### 文档任务

```bash
task add <plan> \
  -t "编写XXX文档" \
  -p "Phase X" \
  -P "P1" \
  -d "编写XXX的使用文档" \
  --criteria "文档结构清晰
包含使用示例
API说明完整" \
  --artifacts "docs/xxx.md"
```
