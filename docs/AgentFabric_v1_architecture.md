# AgentFabric 架构设计文档

> 名称：AgentFabric - Agent 编排与集成框架  
> 版本：v1.0  
> 日期：2026-03-04  
> 定位：面向开发者的 Agent 编排与集成基础设施

---

## 目录

1. [产品定位](#一产品定位)
2. [系统架构](#二系统架构)
3. [技术栈](#三技术栈)
4. [核心组件](#四核心组件)
5. [数据模型](#五数据模型)
6. [接口规范](#六接口规范)
7. [部署架构](#七部署架构)
8. [扩展机制](#八扩展机制)

---

## 一、产品定位

### 1.1 定位

AgentFabric 是一个**面向开发者的 Agent 编排与集成框架**，提供统一的基础设施能力，让开发者能够：

- **统一接入**：整合各类 Agent 能力（LLM、工具、微服务）
- **智能编排**：通过代码或配置编排复杂的 Agent 协作流程
- **灵活扩展**：无缝接入外部 Agent CLI、MCP Server、HTTP 服务
- **生产就绪**：内置高可用、可观测、安全等企业级特性

### 1.2 核心能力

```
┌─────────────────────────────────────────────────────────────────┐
│                      AgentFabric 核心能力                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │  统一接入   │    │  智能编排   │    │  灵活扩展   │        │
│  │             │    │             │    │             │        │
│  │ • 多协议    │    │ • 工作流    │    │ • 插件机制  │        │
│  │ • 多租户    │    │ • 状态机    │    │ • 适配器    │        │
│  │ • 路由分发  │    │ • 上下文    │    │ • 钩子      │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐        │
│  │  生产就绪   │    │  可观测性   │    │  企业集成   │        │
│  │             │    │             │    │             │        │
│  │ • 高可用    │    │ • 链路追踪  │    │ • SSO       │        │
│  │ • 限流熔断  │    │ • 指标监控  │    │ • 审计      │        │
│  │ • 密钥管理  │    │ • 日志聚合  │    │ • 合规      │        │
│  └─────────────┘    └─────────────┘    └─────────────┘        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 适用场景

| 场景             | 描述                                      |
| ---------------- | ----------------------------------------- |
| **AI 应用后端**  | 为 AI 应用提供统一的 Agent 调用与编排能力 |
| **智能助手**     | 构建多 Agent 协作的智能助手系统           |
| **自动化工作流** | 编排 LLM + 工具 + 服务的自动化流程        |
| **API 聚合网关** | 统一接入和管理各类 AI 能力 API            |
| **Agent 即服务** | 将内部 Agent 能力封装为标准化服务         |

---

## 二、系统架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │  Web App │  │ Mobile   │  │  Bot     │  │  Service │  │  IoT     │      │
│  │  (React) │  │ (iOS/And)│  │ (QQ/微信)│  │ (gRPC)   │  │ (MQTT)   │      │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘      │
└───────┼─────────────┼─────────────┼─────────────┼─────────────┼────────────┘
        │             │             │             │             │
        └─────────────┴─────────────┴─────────────┴─────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Access Gateway (接入层)                             │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  • 协议适配：HTTP / WebSocket / gRPC / MQTT                          │    │
│  │  • 认证鉴权：OAuth2 / JWT / API Key / mTLS                          │    │
│  │  • 流量控制：Rate Limit / Circuit Breaker / Load Balance            │    │
│  │  • 请求路由：Path-based / Header-based / Content-based              │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Adapter Layer (适配层) ⭐                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Universal Agent Interface                         │    │
│  │                                                                      │    │
│  │  Input: { request, context, config }                                 │    │
│  │                      │                                               │    │
│  │                      ▼                                               │    │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │    │
│  │  │   MCP      │  │  Stdio     │  │   HTTP     │  │  Custom    │    │    │
│  │  │  Adapter   │  │  Adapter   │  │  Adapter   │  │  Adapter   │    │    │
│  │  │            │  │            │  │            │  │            │    │    │
│  │  │ Protocol:  │  │ Protocol:  │  │ Protocol:  │  │ Protocol:  │    │    │
│  │  │ MCP        │  │ stdin/     │  │ REST/      │  │ Plugin     │    │    │
│  │  │ (stdio/    │  │ stdout     │  │ gRPC/      │  │ Dynamic    │    │    │
│  │  │  sse)      │  │            │  │ SSE        │  │ Load       │    │    │
│  │  └────┬───────┘  └────┬───────┘  └────┬───────┘  └────┬───────┘    │    │
│  │       │               │               │               │             │    │
│  │       └───────────────┴───────────────┴───────────────┘             │    │
│  │                       │                                              │    │
│  │                       ▼                                              │    │
│  │  Output: { response, status, metadata }                              │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                    Agent Registry (Agent 注册中心)                    │    │
│  │                                                                      │    │
│  │  ┌────────────────┬───────────────┬───────────────┬──────────────┐ │    │
│  │  │ Name           │ Type          │ Adapter       │ Status       │ │    │
│  │  ├────────────────┼───────────────┼───────────────┼──────────────┤ │    │
│  │  │ gpt-4          │ llm           │ http          │ ✅ active    │ │    │
│  │  │ claude-3       │ llm           │ http          │ ✅ active    │ │    │
│  │  │ data-analyzer  │ cli           │ stdio         │ ✅ active    │ │    │
│  │  │ rag-server     │ mcp           │ mcp           │ ✅ active    │ │    │
│  │  │ image-proc     │ remote        │ http          │ ✅ active    │ │    │
│  │  │ custom-tool    │ plugin        │ custom        │ ⚠️ standby   │ │    │
│  │  └────────────────┴───────────────┴───────────────┴──────────────┘ │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Core Layer (核心层)                                    │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                        Orchestrator (编排器)                          │  │
│  │                                                                       │  │
│  │   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │  │
│  │   │   Router    │───►│  Processor  │───►│   Handler   │             │  │
│  │   │             │    │             │    │             │             │  │
│  │   │ • 意图识别  │    │ • 预处理    │    │ • 执行调用  │             │  │
│  │   │ • 负载均衡  │    │ • 上下文    │    │ • 后处理    │             │  │
│  │   │ • 路由策略  │    │ • 转换      │    │ • 响应组装  │             │  │
│  │   └─────────────┘    └─────────────┘    └─────────────┘             │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    Middleware Chain (中间件链) ⭐                      │  │
│  │                                                                       │  │
│  │   1. Session      → 会话管理、身份识别                                │  │
│  │   2. Auth         → 权限校验、策略检查                                │  │
│  │   3. Rate Limit   → 限流、配额检查                                    │  │
│  │   4. Transform    → 请求转换、协议适配                                │  │
│  │   5. Context      → 上下文注入、记忆加载                              │  │
│  │   6. Cache        → 缓存查询、结果复用                                │  │
│  │   7. Monitor      → 指标采集、日志记录                                │  │
│  │   8. Error        → 错误处理、降级策略                                │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    Context Manager (上下文管理)                        │  │
│  │                                                                       │  │
│  │   • Global Context    → 跨请求共享数据                                │  │
│  │   • Session Context   → 单次请求生命周期                              │  │
│  │   • Agent Context     → Agent 调用参数                                │  │
│  │   • Secret Context    → 密钥隔离存储                                  │  │
│  │                                                                       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Execution Layer (执行层)                                  │
│                                                                              │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐        │
│  │      Built-in Agents         │  │     External Agents          │        │
│  │                              │  │                              │        │
│  │  • LLM Agent                 │  │  • User Defined CLI          │        │
│  │    - OpenAI                  │  │  • MCP Servers               │        │
│  │    - Claude                  │  │  • HTTP Services             │        │
│  │    - Gemini                  │  │  • gRPC Services             │        │
│  │    - Local Models            │  │  • Serverless Functions      │        │
│  │                              │  │                              │        │
│  │  • Tool Agent                │  │                              │        │
│  │    - Code Execution          │  │                              │        │
│  │    - Database Query          │  │                              │        │
│  │    - File Operation          │  │                              │        │
│  │                              │  │                              │        │
│  │  • Function Agent            │  │                              │        │
│  │    - Custom Logic            │  │                              │        │
│  │    - Business Rules          │  │                              │        │
│  │                              │  │                              │        │
│  └──────────────────────────────┘  └──────────────────────────────┘        │
│                                                                              │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Data Layer (数据层)                                 │
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  PostgreSQL  │  │    Redis     │  │ Object Store │  │  Vector DB   │    │
│  │              │  │              │  │              │  │              │    │
│  │  主存储       │  │  缓存/队列   │  │  对象存储    │  │  向量检索    │    │
│  │  ─────────   │  │  ─────────   │  │  ─────────   │  │  ─────────   │    │
│  │  Users       │  │  Sessions    │  │  Files       │  │  Embeddings  │    │
│  │  Requests    │  │  Cache       │  │  Logs        │  │  Memory      │    │
│  │  Agents      │  │  Queues      │  │  Exports     │  │  Knowledge   │    │
│  │  Memory      │  │  Locks       │  │              │  │              │    │
│  │  Audit       │  │  Pub/Sub     │  │              │  │              │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 架构特点

| 特点         | 说明                                           |
| ------------ | ---------------------------------------------- |
| **分层解耦** | 接入层、适配层、核心层、执行层、数据层清晰分离 |
| **协议无关** | 统一 Agent 接口，屏蔽底层协议差异              |
| **中间件链** | 可插拔的中间件机制，灵活扩展处理能力           |
| **多租户**   | 支持 namespace 级别的资源隔离                  |
| **云原生**   | 支持容器化部署、水平扩展、服务网格             |

---

## 三、技术栈

### 3.1 技术栈总览

```
┌─────────────────────────────────────────────────────────────────┐
│                      AgentFabric 技术栈                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Runtime (运行时)                      │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Language:     TypeScript 5.x                           │   │
│  │  Runtime:      Node.js 20+ LTS                          │   │
│  │  Framework:    Fastify 4.x (HTTP/WebSocket)             │   │
│  │  gRPC:         @grpc/grpc-js                            │   │
│  │  MQTT:         mqtt.js                                  │   │
│  │                                                          │   │
│  │  Concurrency:  Worker Threads (CPU intensive)           │   │
│  │  Async:        Native Promise / Async-Await             │   │
│  │  Stream:       Node.js Stream / WebStreams              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Data Storage (数据存储)               │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Primary DB:   PostgreSQL 15+                           │   │
│  │  ORM:          Prisma 5.x                               │   │
│  │  Migrations:   Prisma Migrate                           │   │
│  │                                                          │   │
│  │  Cache:        Redis 7+                                 │   │
│  │  Client:       ioredis                                  │   │
│  │  Use cases:    Session / Cache / Queue / Lock           │   │
│  │                                                          │   │
│  │  Object Store: MinIO / S3 compatible                    │   │
│  │  SDK:          @aws-sdk/client-s3                       │   │
│  │                                                          │   │
│  │  Vector DB:    pgvector (PostgreSQL extension)          │   │
│  │  ORM:          Prisma + pgvector                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Communication (通信)                    │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  HTTP Server:  Fastify                                  │   │
│  │  WebSocket:    ws / @fastify/websocket                  │   │
│  │  SSE:          @fastify/sse-v2                          │   │
│  │  gRPC:         @grpc/grpc-js + protobufjs               │   │
│  │  MQTT:         mqtt.js (Broker: EMQX)                   │   │
│  │  MessageQueue: BullMQ (Redis-based)                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   Observability (可观测性)               │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Logging:      Pino (structured logging)                │   │
│  │  Tracing:      OpenTelemetry + Jaeger                   │   │
│  │  Metrics:      Prometheus + Grafana                     │   │
│  │  APM:          Elastic APM / SkyWalking (optional)      │   │
│  │  Health:       @fastify/under-pressure                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   DevOps & Deploy (部署)                 │   │
│  │  ─────────────────────────────────────────────────────  │   │
│  │  Container:    Docker / Containerd                      │   │
│  │  Orchestration: Kubernetes                              │   │
│  │  Helm Charts:  Custom Charts                            │   │
│  │  CI/CD:        GitHub Actions / GitLab CI               │   │
│  │  IaC:          Terraform / Pulumi                       │   │
│  │  GitOps:       ArgoCD (optional)                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 核心依赖

```json
{
  "dependencies": {
    "@fastify/autoload": "^5.8.0",
    "@fastify/cors": "^9.0.1",
    "@fastify/helmet": "^11.1.1",
    "@fastify/jwt": "^8.0.1",
    "@fastify/rate-limit": "^9.2.0",
    "@fastify/swagger": "^8.14.0",
    "@fastify/websocket": "^10.0.1",
    "@grpc/grpc-js": "^1.10.0",
    "@prisma/client": "^5.10.0",
    "bullmq": "^5.4.0",
    "dotenv": "^16.4.0",
    "fastify": "^4.26.0",
    "fastify-plugin": "^4.5.1",
    "ioredis": "^5.3.2",
    "pino": "^8.19.0",
    "ws": "^8.16.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "prisma": "^5.10.0",
    "typescript": "^5.3.0",
    "vitest": "^1.3.0"
  }
}
```

### 3.3 架构决策

| 决策       | 选择       | 理由                         |
| ---------- | ---------- | ---------------------------- |
| **语言**   | TypeScript | 类型安全、生态丰富、团队协作 |
| **框架**   | Fastify    | 高性能、低开销、插件丰富     |
| **数据库** | PostgreSQL | 关系型、稳定、pgvector 扩展  |
| **缓存**   | Redis      | 高性能、多场景适用           |
| **队列**   | BullMQ     | Redis-based、支持延迟/重试   |
| **日志**   | Pino       | 高性能结构化日志             |
| **测试**   | Vitest     | 现代测试框架、TS 原生支持    |

---

## 四、核心组件

### 4.1 接入层 (Access Gateway)

负责协议适配、认证鉴权、流量控制。

```
┌─────────────────────────────────────────────────────────────────┐
│                       接入层处理流程                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Request                                                        │
│    │                                                            │
│    ▼                                                            │
│  ┌──────────────┐                                               │
│  │  Protocol    │  HTTP / WebSocket / gRPC / MQTT              │
│  │  Adapter     │  协议解析、格式转换                           │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐                                               │
│  │  Authentication │  JWT / OAuth2 / API Key / mTLS            │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐                                               │
│  │  Rate Limit  │  Token Bucket / Fixed Window                 │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  ┌──────────────┐                                               │
│  │  Router      │  路由到对应 Namespace / Agent                │
│  └──────┬───────┘                                               │
│         │                                                       │
│         ▼                                                       │
│  Adapter Layer                                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 适配层 (Adapter Layer) ⭐

核心组件，负责将各类 Agent 接入统一框架。

#### 4.2.1 MCP Adapter

支持 Model Context Protocol 标准。

```
MCP Adapter
├── Transport
│   ├── stdio    (本地进程)
│   └── sse      (HTTP Server-Sent Events)
├── Capabilities
│   ├── Tools    (工具发现与调用)
│   ├── Resources (资源访问)
│   └── Prompts  (提示模板)
└── Lifecycle
    ├── Discover (能力发现)
    ├── Connect  (连接建立)
    ├── Invoke   (请求调用)
    └── Disconnect (连接断开)
```

#### 4.2.2 Stdio Adapter

支持本地 CLI 工具。

```
Stdio Adapter
├── Process Management
│   ├── Spawn    (启动进程)
│   ├── Monitor  (监控状态)
│   └── Kill     (终止进程)
├── Communication
│   ├── stdin    (发送输入)
│   ├── stdout   (接收输出)
│   └── stderr   (错误处理)
└── Protocol
    ├── JSON-RPC (结构化通信)
    └── Stream   (流式处理)
```

#### 4.2.3 HTTP Adapter

支持远程 HTTP 服务。

```
HTTP Adapter
├── Protocol
│   ├── REST     (JSON API)
│   ├── SSE      (Server-Sent Events)
│   └── gRPC     (HTTP/2)
├── Resilience
│   ├── Retry    (自动重试)
│   ├── Timeout  (超时控制)
│   └── Circuit  (熔断降级)
└── Load Balance
    ├── Round Robin
    ├── Weighted
    └── Least Connection
```

### 4.3 核心层 (Core Layer)

#### 4.3.1 编排器 (Orchestrator)

```
┌─────────────────────────────────────────────────────────────────┐
│                        编排器架构                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                      Request Context                      │   │
│  │  { namespace, agent, input, metadata }                   │   │
│  └────────────────────────┬────────────────────────────────┘   │
│                           │                                     │
│           ┌───────────────┼───────────────┐                    │
│           ▼               ▼               ▼                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │    Router    │  │  Middleware  │  │   Handler    │         │
│  │              │  │     Chain    │  │              │         │
│  │ • 静态路由   │  │              │  │ • Agent 调用 │         │
│  │ • 动态路由   │  │ • 身份认证   │  │ • 结果处理   │         │
│  │ • 负载均衡   │  │ • 限流熔断   │  │ • 错误处理   │         │
│  │ • 灰度发布   │  │ • 上下文注入 │  │ • 响应组装   │         │
│  └──────────────┘  │ • 缓存查询   │  └──────────────┘         │
│                    │ • 日志记录   │                           │
│                    └──────────────┘                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

#### 4.3.2 中间件链 (Middleware Chain)

| 中间件         | 职责                 | 顺序 |
| -------------- | -------------------- | ---- |
| **Session**    | 会话管理、身份识别   | 1    |
| **Auth**       | 权限校验、策略检查   | 2    |
| **Rate Limit** | 限流、配额检查       | 3    |
| **Transform**  | 请求转换、协议适配   | 4    |
| **Context**    | 上下文注入、记忆加载 | 5    |
| **Cache**      | 缓存查询、结果复用   | 6    |
| **Monitor**    | 指标采集、日志记录   | 7    |
| **Error**      | 错误处理、降级策略   | 8    |

### 4.4 执行层 (Execution Layer)

#### 4.4.1 内置 Agents

| Agent              | 功能       | 配置                          |
| ------------------ | ---------- | ----------------------------- |
| **LLM Agent**      | 调用大模型 | model, temperature, maxTokens |
| **Tool Agent**     | 执行工具   | command, timeout, sandbox     |
| **Function Agent** | 执行函数   | handler, memory, timeout      |
| **Flow Agent**     | 子流程编排 | workflowId, inputs, outputs   |

#### 4.4.2 外部 Agents

通过 Adapter 接入的用户自定义 Agent。

---

## 五、数据模型

### 5.1 核心实体

**Namespace（命名空间）**

```typescript
interface Namespace {
  id: string;
  name: string;
  description: string;

  // 资源配置
  config: {
    rateLimit: RateLimitConfig;
    quota: QuotaConfig;
    agents: string[]; // 可用的 Agents
  };

  // 凭证
  credentials: Credential[];

  createdAt: Date;
  updatedAt: Date;
}
```

**Agent（代理定义）**

```typescript
interface Agent {
  id: string;
  namespaceId: string;
  name: string;
  description: string;

  // 适配器配置
  adapter: {
    type: 'mcp' | 'stdio' | 'http' | 'function';
    config: AdapterConfig;
  };

  // 能力声明
  capabilities: {
    inputSchema: JSONSchema;
    outputSchema: JSONSchema;
    streaming: boolean;
  };

  // 运行时配置
  runtime: {
    timeout: number;
    retries: number;
    concurrency: number;
  };

  status: 'active' | 'inactive' | 'error';
  createdAt: Date;
  updatedAt: Date;
}
```

**Request（请求记录）**

```typescript
interface Request {
  id: string;
  namespaceId: string;
  agentId: string;

  // 请求内容
  input: unknown;
  context: RequestContext;

  // 响应内容
  output?: unknown;
  error?: ErrorInfo;

  // 执行状态
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

  // 性能指标
  metrics: {
    startedAt: Date;
    completedAt?: Date;
    duration?: number;
    tokens?: number;
  };

  // 链路追踪
  traceId: string;
  spanId: string;
}
```

---

## 六、接口规范

### 6.1 REST API

```
# Namespace 管理
POST   /v1/namespaces
GET    /v1/namespaces
GET    /v1/namespaces/:id
PUT    /v1/namespaces/:id
DELETE /v1/namespaces/:id

# Agent 管理
POST   /v1/namespaces/:ns/agents
GET    /v1/namespaces/:ns/agents
GET    /v1/namespaces/:ns/agents/:id
PUT    /v1/namespaces/:ns/agents/:id
DELETE /v1/namespaces/:ns/agents/:id
POST   /v1/namespaces/:ns/agents/:id/test
POST   /v1/namespaces/:ns/agents/:id/invoke

# 请求执行
POST   /v1/invoke              # 同步执行
POST   /v1/invoke/async        # 异步执行
GET    /v1/requests/:id        # 查询结果
DELETE /v1/requests/:id        # 取消执行

# 流式接口
WS     /v1/stream              # WebSocket
GET    /v1/stream/sse          # SSE

# 管理接口
GET    /v1/metrics             # 监控指标
GET    /v1/health              # 健康检查
GET    /v1/ready               # 就绪检查
```

### 6.2 Agent 协议

见统一 Agent 接口协议（与 AgentHub 相同）。

---

## 七、部署架构

### 7.1 部署拓扑

```
┌─────────────────────────────────────────────────────────────────┐
│                        生产部署拓扑                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Load Balancer                         │   │
│  │                 (Nginx / Cloud LB)                       │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│                            │                                    │
│           ┌────────────────┼────────────────┐                  │
│           ▼                ▼                ▼                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │ AgentFabric  │  │ AgentFabric  │  │ AgentFabric  │         │
│  │   Instance   │  │   Instance   │  │   Instance   │         │
│  │      #1      │  │      #2      │  │      #3      │         │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘         │
│         │                 │                 │                  │
│         └─────────────────┼─────────────────┘                  │
│                           │                                    │
│  ┌────────────────────────┼────────────────────────┐          │
│  │                        ▼                        │          │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐      │          │
│  │  │PostgreSQL│  │  Redis   │  │  MinIO   │      │          │
│  │  │ (HA)     │  │ (HA)     │  │ (HA)     │      │          │
│  │  └──────────┘  └──────────┘  └──────────┘      │          │
│  └────────────────────────────────────────────────┘          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Observability Stack                   │   │
│  │  • Prometheus (Metrics)                                  │   │
│  │  • Grafana (Dashboard)                                   │   │
│  │  • Jaeger (Tracing)                                      │   │
│  │  • Loki (Log Aggregation)                                │   │
│  │  • AlertManager (Alerting)                               │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Kubernetes 部署

```yaml
# 核心组件
apiVersion: apps/v1
kind: Deployment
metadata:
  name: agentfabric-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: agentfabric-api
  template:
    spec:
      containers:
        - name: api
          image: agentfabric/api:v1.0.0
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: agentfabric-secrets
                  key: database-url
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: agentfabric-secrets
                  key: redis-url
          resources:
            requests:
              memory: '512Mi'
              cpu: '500m'
            limits:
              memory: '2Gi'
              cpu: '2000m'
```

---

## 八、扩展机制

### 8.1 自定义 Adapter

```typescript
interface AgentAdapter {
  // 连接
  connect(config: AdapterConfig): Promise<Connection>;

  // 执行
  invoke(request: AgentRequest, callback: (event: StreamEvent) => void): Promise<AgentResponse>;

  // 断开
  disconnect(): Promise<void>;

  // 健康检查
  healthCheck(): Promise<HealthStatus>;
}
```

### 8.2 自定义 Middleware

```typescript
interface Middleware {
  name: string;
  order: number;

  process(context: RequestContext, next: () => Promise<void>): Promise<void>;
}
```

### 8.3 自定义 Agent

```typescript
// Function Agent 示例
const customAgent: FunctionAgent = {
  name: 'data-processor',

  async execute(input, context) {
    // 自定义逻辑
    const result = await processData(input);
    return { result };
  },
};
```

---

**产品名称**: AgentFabric  
**版本**: v1.0  
**定位**: Agent 编排与集成框架  
**最后更新**: 2026-03-04
