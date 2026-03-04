# Kimi Automation CLI - PowerShell 脚本

param(
    [Parameter(Position=0)]
    [ValidateSet("run", "plan", "plans", "init", "help")]
    [string]$Command = "run",
    
    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$Arguments
)

$ErrorActionPreference = "Stop"

# 检查是否已构建
if (-not (Test-Path "dist\index.js")) {
    Write-Host "正在构建..." -ForegroundColor Yellow
    pnpm build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "构建失败" -ForegroundColor Red
        exit 1
    }
}

# 执行命令
switch ($Command) {
    "run" {
        Write-Host "启动自动化执行..." -ForegroundColor Green
        Write-Host "Plan 和 Plan Path 会自动从 TaskMaster 配置读取" -ForegroundColor Gray
        Write-Host ""
        & node dist\index.js run @Arguments
    }
    "plan" {
        Write-Host "查看执行计划..." -ForegroundColor Green
        & node dist\index.js plan @Arguments
    }
    "plans" {
        Write-Host "查看可用计划..." -ForegroundColor Green
        & node dist\index.js plans @Arguments
    }
    "init" {
        Write-Host "初始化配置文件..." -ForegroundColor Green
        & node dist\index.js init @Arguments
    }
    "help" {
        & node dist\index.js --help
    }
}
