# AgentFabric MVP v1 实施计划

> 数据驱动文档，详情查看 [data.json](./data.json)

---

## 📋 项目概述

**MVP 目标**：构建一个最小可用的 Agent 编排框架，支持基础的 Agent 接入、管理和调用能力。

**MVP 范围**：聚焦核心链路（HTTP 接入 → 简单编排 → Agent 调用），暂时排除复杂的企业级特性。

---

## 🗓️ 实施阶段

6 个阶段，共 29 个任务，预计 7 周完成。

| 阶段    | 名称            | 周期       | 核心交付物                        | 任务数 | 工时 |
| ------- | --------------- | ---------- | --------------------------------- | ------ | ---- |
| Phase 1 | 基础架构        | Week 1     | 项目骨架、数据库、基础中间件      | 6      | 26h  |
| Phase 2 | 接入层          | Week 2     | HTTP API、认证、限流              | 5      | 26h  |
| Phase 3 | 适配层          | Week 3-3.5 | HTTP Adapter、MCP Adapter (stdio) | 5      | 34h  |
| Phase 4 | 核心层          | Week 3.5-5 | 编排器、中间件链、LLM Agent       | 5      | 40h  |
| Phase 5 | 数据与治理      | Week 5-6   | 上下文管理、日志监控、测试        | 4      | 26h  |
| Phase 6 | 集成测试 & 文档 | Week 6-7   | E2E 测试、部署文档、使用指南      | 4      | 24h  |

---

## 📑 任务索引

### Phase 1: 基础架构搭建（Week 1）

| 任务                                                | 名称               | 工时 | 状态 |
| --------------------------------------------------- | ------------------ | ---- | ---- |
| [TASK-001](./tasks/TASK-001_project_init.md)        | 项目初始化         | 4h   | 🔵   |
| [TASK-002](./tasks/TASK-002_fastify_integration.md) | Fastify 框架集成   | 4h   | 🔵   |
| [TASK-003](./tasks/TASK-003_database_init.md)       | 数据库层初始化     | 6h   | 🔵   |
| [TASK-004](./tasks/TASK-004_redis_init.md)          | Redis 缓存层初始化 | 4h   | 🔵   |
| [TASK-005](./tasks/TASK-005_config_system.md)       | 配置管理系统       | 4h   | 🔵   |
| [TASK-006](./tasks/TASK-006_logging_system.md)      | 日志系统搭建       | 4h   | 🔵   |

### Phase 2: 接入层开发（Week 2）

| 任务                                          | 名称               | 工时 | 状态 |
| --------------------------------------------- | ------------------ | ---- | ---- |
| [TASK-007](./tasks/TASK-007_http_access.md)   | 基础 HTTP 接入     | 4h   | 🔵   |
| [TASK-008](./tasks/TASK-008_api_auth.md)      | API 认证机制       | 6h   | 🔵   |
| [TASK-009](./tasks/TASK-009_rate_limit.md)    | 限流与熔断         | 6h   | 🔵   |
| [TASK-010](./tasks/TASK-010_health_check.md)  | 健康检查接口       | 4h   | 🔵   |
| [TASK-011](./tasks/TASK-011_namespace_api.md) | Namespace 管理 API | 6h   | 🔵   |

### Phase 3: 适配层开发（Week 3 - Week 3.5）

| 任务                                              | 名称                     | 工时 | 状态 |
| ------------------------------------------------- | ------------------------ | ---- | ---- |
| [TASK-012](./tasks/TASK-012_adapter_interface.md) | 统一 Agent 接口定义      | 4h   | 🔵   |
| [TASK-013](./tasks/TASK-013_agent_registry.md)    | Agent Registry 实现      | 6h   | 🔵   |
| [TASK-014](./tasks/TASK-014_http_adapter.md)      | HTTP Adapter 实现        | 8h   | 🔵   |
| [TASK-015](./tasks/TASK-015_mcp_adapter.md)       | MCP Adapter (stdio) 实现 | 10h  | 🔵   |
| [TASK-016](./tasks/TASK-016_agent_api.md)         | Agent 管理 API           | 6h   | 🔵   |

### Phase 4: 核心层开发（Week 3.5 - Week 5）

| 任务                                                 | 名称                       | 工时 | 状态 |
| ---------------------------------------------------- | -------------------------- | ---- | ---- |
| [TASK-017](./tasks/TASK-017_orchestrator.md)         | 编排器 (Orchestrator) 核心 | 8h   | 🔵   |
| [TASK-018](./tasks/TASK-018_middleware_framework.md) | 中间件链框架               | 6h   | 🔵   |
| [TASK-019](./tasks/TASK-019_core_middlewares.md)     | 核心中间件实现             | 8h   | 🔵   |
| [TASK-020](./tasks/TASK-020_llm_agent.md)            | LLM Agent 内置实现         | 10h  | 🔵   |
| [TASK-021](./tasks/TASK-021_invoke_api.md)           | 调用执行 API               | 8h   | 🔵   |

### Phase 5: 数据与治理（Week 5 - Week 6）

| 任务                                             | 名称           | 工时 | 状态 |
| ------------------------------------------------ | -------------- | ---- | ---- |
| [TASK-022](./tasks/TASK-022_context_manager.md)  | 上下文管理     | 6h   | 🔵   |
| [TASK-023](./tasks/TASK-023_request_tracking.md) | 请求记录与追踪 | 6h   | 🔵   |
| [TASK-024](./tasks/TASK-024_monitoring.md)       | 基础监控指标   | 4h   | 🔵   |
| [TASK-025](./tasks/TASK-025_testing.md)          | 基础测试覆盖   | 10h  | 🔵   |

### Phase 6: 集成测试与文档（Week 6 - Week 7）

| 任务                                        | 名称     | 工时 | 状态 |
| ------------------------------------------- | -------- | ---- | ---- |
| [TASK-026](./tasks/TASK-026_e2e_testing.md) | E2E 测试 | 8h   | 🔵   |
| [TASK-027](./tasks/TASK-027_deployment.md)  | 部署脚本 | 6h   | 🔵   |
| [TASK-028](./tasks/TASK-028_api_docs.md)    | API 文档 | 4h   | 🔵   |
| [TASK-029](./tasks/TASK-029_user_guide.md)  | 使用指南 | 6h   | 🔵   |

> **状态说明**：🔵 待开始 | 🟡 进行中 | 🟢 已完成 | 🔴 已阻塞

---

## ✅ MVP 验收标准

### 功能验收

- 可通过 API 创建 Namespace 和 Agent
- 可接入 HTTP 接口型 Agent 和 MCP (stdio) Agent
- 可通过 API 调用 Agent 并获得响应
- 支持流式响应（SSE/WebSocket）
- LLM Agent 可调用 OpenAI 接口

### 质量验收

- 单元测试覆盖率 ≥ 70%
- E2E 测试通过率 100%
- 无高危安全漏洞
- 平均响应延迟 < 500ms（本地 Agent）

### 运维验收

- 提供 Dockerfile 和 docker-compose
- 有健康检查接口
- 有 Prometheus 监控指标
- 结构化日志可输出

### 文档验收

- API 文档完整（Swagger）
- 有快速开始指南
- 有 Agent 接入示例
- 有部署操作手册

---

## 🖥️ 任务管理 CLI

提供命令行工具管理任务进度。CLI 位于 `../cli/` 目录，支持多计划项目管理。

### 快速开始

```bash
# 查看所有计划
..\task.bat plans

# 查看本计划进度
..\task.bat progress mvp_v1

# 列出本计划任务
..\task.bat list mvp_v1

# 开始任务
..\task.bat start mvp_v1 TASK-001

# 完成任务
..\task.bat done mvp_v1 TASK-001

# 添加新任务
..\task.bat add mvp_v1 -t "新任务标题" -p "Phase 1" -P "P1"
```

### CLI 命令

| 命令                  | 说明         | 示例                           |
| --------------------- | ------------ | ------------------------------ |
| `plans`               | 列出所有计划 | `task plans`                   |
| `list <plan>`         | 列出任务     | `task list mvp_v1`             |
| `show <plan> <id>`    | 显示任务详情 | `task show mvp_v1 TASK-001`    |
| `start <plan> <id>`   | 开始任务     | `task start mvp_v1 TASK-001`   |
| `done <plan> <id>`    | 完成任务     | `task done mvp_v1 TASK-001`    |
| `block <plan> <id>`   | 阻塞任务     | `task block mvp_v1 TASK-001`   |
| `archive <plan> <id>` | 归档任务     | `task archive mvp_v1 TASK-001` |
| `add <plan>`          | 添加新任务   | `task add mvp_v1 -t "标题"`    |
| `progress <plan>`     | 显示进度     | `task progress mvp_v1`         |

### 过滤选项

```bash
# 按阶段
..\task.bat list mvp_v1 --phase phase_1

# 按状态
..\task.bat list mvp_v1 --status in_progress

# 按优先级
..\task.bat list mvp_v1 --priority P0
```

详见 [../cli/README.md](../cli/README.md)

---

## 📝 手动管理

### 查看任务详情

每个任务都有独立的 Markdown 文件，包含：

- 任务描述与目标
- 验收标准（引用 data.json）
- 输出产物清单
- 子任务分解
- 依赖关系
- 注意事项

### 直接修改 JSON

```bash
# 编辑 data.json 更新状态
{
  "id": "TASK-001",
  "status": "in_progress"  // pending | in_progress | completed | blocked
}
```

### 任务归档

```bash
mv tasks/TASK-001_project_init.md tasks/done/
```

---

## 🔗 相关文档

- [架构设计文档](../../AgentFabric_v1_architecture.md)
- [任务数据 (JSON)](./data.json)
