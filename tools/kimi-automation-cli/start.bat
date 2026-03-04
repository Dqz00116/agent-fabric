@echo off
chcp 65001 >nul
echo ==========================================
echo    Kimi Automation CLI
echo ==========================================
echo.

:: 检查是否已构建
if not exist "dist\index.js" (
  echo 正在构建...
  call pnpm build
  if errorlevel 1 (
    echo 构建失败
    exit /b 1
  )
)

echo 启动自动化执行...
echo.
echo 提示: 使用默认配置，planName 和 planPath 会自动从 TaskMaster 配置读取
echo.

:: 运行自动化（使用 TaskMaster 默认计划）
node dist\index.js run %*

pause
