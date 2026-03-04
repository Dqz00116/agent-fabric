# TaskMaster Skill 使用示例

> 常见场景的完整操作示例

---

## 场景一：新成员加入项目

### 1. 了解项目概况

```bash
# 查看有哪些计划（在 docs/plans 目录）
cd docs/plans

# 查看有哪些计划
taskmaster-skill\task.bat plans

# 查看 mvp_v1 计划进度
taskmaster-skill\task.bat progress mvp_v1
```

### 2. 查看当前进行中的任务

```bash
# 列出进行中的任务
taskmaster-skill\task.bat list mvp_v1 --status in_progress

# 查看某个任务的详情
taskmaster-skill\task.bat show mvp_v1 TASK-002
```

### 3. 领取新任务

```bash
# 查看待办的 P0 任务
taskmaster-skill\task.bat list mvp_v1 --status pending --priority P0

# 查看任务详情
taskmaster-skill\task.bat show mvp_v1 TASK-005

# 确认依赖已完成，开始任务
taskmaster-skill\task.bat start mvp_v1 TASK-005
```

---

## 场景二：开发流程

### 步骤 1：开始任务

```bash
# 查看任务详情
taskmaster-skill\task.bat show mvp_v1 TASK-010

# 检查依赖
taskmaster-skill\task.bat show mvp_v1 TASK-008  # 依赖任务
taskmaster-skill\task.bat show mvp_v1 TASK-009  # 依赖任务

# 开始任务
taskmaster-skill\task.bat start mvp_v1 TASK-010
```

### 步骤 2：开发过程中遇到阻塞

```bash
# 标记任务阻塞
taskmaster-skill\task.bat block mvp_v1 TASK-010

# ... 等待问题解决 ...

# 恢复进行
taskmaster-skill\task.bat start mvp_v1 TASK-010 --force
```

### 步骤 3：完成任务

```bash
# 开发完成，自测通过
# 代码已提交，文档已更新

# 标记完成
taskmaster-skill\task.bat done mvp_v1 TASK-010

# 归档
taskmaster-skill\task.bat archive mvp_v1 TASK-010
```

---

## 场景三：项目经理检查进度

### 每日检查

```bash
# 查看整体进度
taskmaster-skill\task.bat progress mvp_v1

# 查看昨天到今天完成的任务
taskmaster-skill\task.bat list mvp_v1 --status completed

# 查看进行中的任务
taskmaster-skill\task.bat list mvp_v1 --status in_progress

# 查看是否有阻塞的任务
taskmaster-skill\task.bat list mvp_v1 --status blocked
```

### 周总结

```bash
# 生成周报数据
# 1. 总体进度
taskmaster-skill\task.bat progress mvp_v1

# 2. 各阶段进度
taskmaster-skill\task.bat list mvp_v1 --phase phase_1
taskmaster-skill\task.bat list mvp_v1 --phase phase_2

# 3. 下周计划（待办 P0）
taskmaster-skill\task.bat list mvp_v1 --status pending --priority P0
```

---

## 场景四：添加新任务

### 简单添加

```bash
# 添加一个简单任务
taskmaster-skill\task.bat add mvp_v1 -t "修复数据库连接池泄漏"
```

### 完整添加（推荐）

```bash
# Windows (使用 ^ 换行)
taskmaster-skill\task.bat add mvp_v1 ^
  -t "实现 JWT 认证中间件" ^
  -p "Phase 2" ^
  -P "P0" ^
  -d "实现基于 JWT 的 API 认证中间件，保护敏感接口" ^
  --depends "TASK-002,TASK-007" ^
  --criteria "支持 Bearer Token 解析^支持 Token 过期验证^支持刷新 Token 机制^错误返回 401" ^
  --artifacts "src/middleware/auth.ts,src/services/jwt.ts" ^
  --background "当前 API 缺乏认证保护，需要添加 JWT 认证" ^
  --goals "实现安全的 API 认证机制^支持 Token 自动刷新" ^
  --tech "使用 jsonwebtoken 库^RS256 算法签名^Token 有效期 2 小时" ^
  --steps "安装依赖^实现 Token 生成^实现验证中间件^添加刷新接口^编写测试" ^
  --notes "注意处理时钟偏移问题" ^
  --references "https://jwt.io/introduction"

# Linux/Mac (使用 \ 换行)
./taskmaster-skill/task.sh add mvp_v1 \
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

### 添加子任务

```bash
# 将大任务拆分为子任务
# 原任务：TASK-015 MCP Adapter 实现

# 添加子任务 1
taskmaster-skill\task.bat add mvp_v1 ^
  -t "MCP Adapter - 进程管理" ^
  -p "Phase 3" ^
  -P "P0" ^
  -d "实现 MCP Server 进程的启动、监控、停止" ^
  --depends "TASK-012" ^
  --criteria "实现进程启动^实现进程监控^实现进程优雅停止" ^
  --artifacts "src/adapters/mcp/process-manager.ts"

# 添加子任务 2
taskmaster-skill\task.bat add mvp_v1 ^
  -t "MCP Adapter - JSON-RPC 通信" ^
  -p "Phase 3" ^
  -P "P0" ^
  -d "实现 JSON-RPC 消息序列化和请求响应匹配" ^
  --depends "TASK-XXX" ^
  --criteria "实现消息序列化^实现请求响应匹配^处理超时和错误" ^
  --artifacts "src/adapters/mcp/protocol.ts"
```

---

## 场景五：多任务并行

### 查看可并行的任务

```bash
# 查看无依赖的待办任务
taskmaster-skill\task.bat list mvp_v1 --status pending

# 查看特定阶段的任务
taskmaster-skill\task.bat list mvp_v1 --phase phase_1 --status pending
```

### 同时开始多个任务

```bash
# 开始任务 A
taskmaster-skill\task.bat start mvp_v1 TASK-020

# 开始任务 B（无依赖或依赖已完成）
taskmaster-skill\task.bat start mvp_v1 TASK-021

# 查看进行中的任务
taskmaster-skill\task.bat list mvp_v1 --status in_progress
```

---

## 场景六：任务阻塞处理

### 标记阻塞

```bash
# 任务因第三方 API 文档未发布而阻塞
taskmaster-skill\task.bat block mvp_v1 TASK-014

# 在任务文档中记录阻塞原因
# 编辑 tasks/TASK-014_http_adapter.md
# 添加阻塞原因：等待第三方 API 文档发布
```

### 解决阻塞

```bash
# 第三方 API 文档已发布
# 恢复任务
taskmaster-skill\task.bat start mvp_v1 TASK-014 --force
```

---

## 场景七：代码审查相关

### 审查前

```bash
# 查看已完成的任务
taskmaster-skill\task.bat list mvp_v1 --status completed

# 查看任务详情
taskmaster-skill\task.bat show mvp_v1 TASK-015
```

### 审查不通过

```bash
# 重新打开任务（手动修改 data.json 中的 status 为 in_progress）
# 或者添加新任务修复问题
taskmaster-skill\task.bat add mvp_v1 ^
  -t "修复 MCP Adapter 错误处理" ^
  -p "Phase 3" ^
  -P "P0" ^
  -d "代码审查发现错误处理不完善，需要修复" ^
  --depends "TASK-015" ^
  --criteria "完善错误类型定义^添加错误日志^补充单元测试" ^
  --artifacts "src/adapters/mcp-adapter.ts"
```

---

## 场景八：项目收尾

### 检查未完成任务

```bash
# 查看所有待办任务
taskmaster-skill\task.bat list mvp_v1 --status pending

# 查看 P0 待办
taskmaster-skill\task.bat list mvp_v1 --status pending --priority P0
```

### 批量完成

```bash
# 逐个完成剩余任务
taskmaster-skill\task.bat done mvp_v1 TASK-028
taskmaster-skill\task.bat archive mvp_v1 TASK-028

taskmaster-skill\task.bat done mvp_v1 TASK-029
taskmaster-skill\task.bat archive mvp_v1 TASK-029
```

### 最终归档

```bash
# 确保所有任务已归档
taskmaster-skill\task.bat list mvp_v1

# 所有任务应该在 done/ 目录
ls mvp_v1/tasks/done/
```

---

## 快捷命令汇总

```bash
# 最常用的命令
taskmaster-skill\task.bat progress mvp_v1                    # 查看进度
taskmaster-skill\task.bat list mvp_v1 --status pending       # 查看待办
taskmaster-skill\task.bat list mvp_v1 --priority P0          # 查看 P0 任务
taskmaster-skill\task.bat show mvp_v1 TASK-XXX               # 查看详情
taskmaster-skill\task.bat start mvp_v1 TASK-XXX              # 开始任务
taskmaster-skill\task.bat done mvp_v1 TASK-XXX               # 完成任务
taskmaster-skill\task.bat archive mvp_v1 TASK-XXX            # 归档任务
taskmaster-skill\task.bat add mvp_v1 -t "标题"               # 添加任务
```

### 创建别名（Linux/Mac）

```bash
# 添加到 ~/.bashrc 或 ~/.zshrc
alias task='~/projects/agent-fabric/docs/plans/taskmaster-skill/task.sh'
alias tp='task progress mvp_v1'
alias tl='task list mvp_v1'
alias ts='task show mvp_v1'
```

### 创建批处理（Windows）

创建 `task.cmd` 文件：

```batch
@echo off
call E:\Agent\agent-fabric\docs\plans\taskmaster-skill\task.bat %*
```
