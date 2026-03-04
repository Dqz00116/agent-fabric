# Prisma 数据库配置

## 快速开始

### 1. 配置环境变量

确保 `.env` 文件中配置了正确的数据库连接字符串：

```env
# 本地 PostgreSQL
DATABASE_URL=postgresql://用户名:密码@localhost:5432/agent_fabric

# Docker PostgreSQL（推荐开发使用）
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agent_fabric
```

### 2. 启动数据库（二选一）

**选项 A: 使用 Docker（推荐）**

```bash
# 启动 PostgreSQL 容器
docker-compose -f docker-compose.db.yml up -d

# 查看容器状态
docker ps
```

**选项 B: 使用本地 PostgreSQL**

确保本地 PostgreSQL 服务正在运行，并创建数据库：

```sql
CREATE DATABASE agent_fabric;
```

### 3. 执行数据库迁移

```bash
# 执行迁移（创建表结构）
npx prisma migrate dev

# 生成 Prisma Client
npx prisma generate
```

### 4. 验证连接

```bash
# 打开 Prisma Studio（可视化数据库管理）
npx prisma studio

# 或使用脚本验证
node -e "const {PrismaClient} = require('@prisma/client'); const p = new PrismaClient(); p.\$connect().then(() => console.log('✅ 连接成功')).catch(e => console.error('❌ 连接失败:', e)).finally(() => p.\$disconnect())"
```

## 数据库模型

### Namespace（命名空间）
- 用于隔离不同租户/用户的数据
- 关联：ApiKey, Agent, Request

### Agent（智能体）
- AI 智能体定义
- 配置：模型、系统提示、可用工具
- 关联：Namespace, Request

### Request（请求记录）
- API 请求日志
- 记录：方法、路径、请求/响应、耗时、错误
- 关联：Namespace, Agent

### ApiKey（API 密钥）
- API 密钥管理
- 字段：密钥哈希、名称、权限范围、过期时间
- 关联：Namespace

## 常用命令

```bash
# 查看迁移状态
npx prisma migrate status

# 创建新的迁移
npx prisma migrate dev --name 迁移名称

# 重置数据库（危险！会删除数据）
npx prisma migrate reset

# 查看数据库结构
npx prisma db pull

# 推送结构到数据库（不创建迁移文件）
npx prisma db push

# 生成客户端（Schema 变更后执行）
npx prisma generate

# 种子数据
npx prisma db seed
```

## 故障排除

### 连接失败
1. 检查 PostgreSQL 服务是否运行
2. 检查 `.env` 中的连接字符串
3. 检查防火墙设置

### 迁移失败
1. 检查数据库权限
2. 尝试重置：`npx prisma migrate reset`
3. 查看详细日志：`npx prisma migrate dev --verbose`

### Prisma Client 未找到
1. 运行 `npx prisma generate`
2. 检查 `node_modules/@prisma/client` 是否存在
