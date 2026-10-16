@echo off
chcp 65001 >nul
set "EXE=%~dp0src-tauri\target\release\stickers_tauri.exe"

if exist "%EXE%" (
  start "" "%EXE%"
  exit /b 0
)

set "INST=%LocalAppData%\Programs\贴纸板\stickers_tauri.exe"

if exist "%INST%" (
  start "" "%INST%"
  exit /b 0
)

echo stickers_tauri.exe not found. Run: npm run build:client
pause
