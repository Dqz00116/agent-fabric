# AgentFabric 数据库初始化脚本
# 使用前请确保 Docker Desktop 已启动，或本地 PostgreSQL 已配置

param(
    [switch]$UseDocker,
    [switch]$SkipDocker
)

$ErrorActionPreference = "Stop"

Write-Host "🚀 AgentFabric 数据库初始化脚本" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# 检查 .env 文件
if (-not (Test-Path .env)) {
    Write-Error "❌ .env 文件不存在，请先配置数据库连接信息"
    exit 1
}

# Docker 模式
if ($UseDocker) {
    Write-Host "🐳 使用 Docker 启动 PostgreSQL..." -ForegroundColor Yellow
    
    # 检查 Docker 是否运行
    try {
        docker ps > $null 2>&1
    } catch {
        Write-Error "❌ Docker Desktop 未运行，请先启动 Docker Desktop"
        exit 1
    }
    
    # 启动容器
    docker-compose -f docker-compose.db.yml up -d
    
    Write-Host "⏳ 等待数据库启动..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    
    # 检查容器状态
    $containerStatus = docker inspect -f '{{.State.Status}}' agent-fabric-db 2>$null
    if ($containerStatus -ne 'running') {
        Write-Error "❌ 数据库容器启动失败"
        exit 1
    }
    
    Write-Host "✅ 数据库容器已启动" -ForegroundColor Green
}

# 运行 Prisma 迁移
Write-Host "🔄 执行数据库迁移..." -ForegroundColor Yellow
try {
    npx prisma migrate dev --name init
    Write-Host "✅ 数据库迁移完成" -ForegroundColor Green
} catch {
    Write-Error "❌ 数据库迁移失败: $_"
    exit 1
}

# 生成 Prisma Client
Write-Host "🔧 生成 Prisma Client..." -ForegroundColor Yellow
npx prisma generate
Write-Host "✅ Prisma Client 生成完成" -ForegroundColor Green

# 可选：验证连接
Write-Host "🔍 验证数据库连接..." -ForegroundColor Yellow
try {
    npx prisma db execute --stdin <<EOF
SELECT version();
EOF
    Write-Host "✅ 数据库连接正常" -ForegroundColor Green
} catch {
    Write-Warning "⚠️ 数据库连接验证失败，但配置已完成"
}

Write-Host ""
Write-Host "🎉 数据库初始化完成！" -ForegroundColor Green
Write-Host ""
Write-Host "后续操作:" -ForegroundColor Cyan
Write-Host "  - 查看数据库: npx prisma studio"
Write-Host "  - 查看迁移状态: npx prisma migrate status"
Write-Host "  - 重置数据库: npx prisma migrate reset"
