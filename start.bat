@echo off
chcp 65001 >nul
echo ========================================
echo   ContractLens - Word合同审核助手
echo ========================================
echo.

echo [1/2] 安装依赖...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo 依赖安装失败，请检查 Node.js 是否已安装。
    pause
    exit /b 1
)

echo.
echo [2/2] 启动开发服务器...
echo.
call npm run dev
pause
