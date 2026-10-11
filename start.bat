@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Novel Polisher - 一键启动

cd /d "%~dp0\novel-polisher"

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 20+：https://nodejs.org/
    pause
    exit /b 1
)

if not exist node_modules (
    echo [信息] 首次运行，正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请检查网络后重试
        pause
        exit /b 1
    )
)

echo [信息] 正在启动开发服务器 (http://localhost:5173) ...
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:5173"

call npm run dev

echo.
echo [提示] 服务已退出。
pause
endlocal