@echo off
chcp 65001 >nul
title Erii AI Companion Restart

echo ===================================================
echo               Erii AI Companion 重启器             
echo ===================================================

echo [1/3] 正在终止旧的 Electron 及 Companion 进程...
taskkill /F /IM electron.exe 2>nul

echo [2/3] 正在启动本地 Companion 侧车服务...
start "Erii-Companion-Core" /min powershell -NoExit -Command "Set-Location 'D:\soft\Erii'; pnpm run companion:dev"

echo [3/3] 正在拉起 AIRI 桌面端...
timeout /t 2 /nobreak >nul
start "Erii-Desktop-UI" powershell -NoExit -Command "Set-Location 'D:\soft\Erii'; pnpm run dev:tamagotchi"

echo ===================================================
echo [SUCCESS] 重启指令已发送，应用即将就绪！
echo ===================================================
