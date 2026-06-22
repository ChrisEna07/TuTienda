@echo off
title TuTienda by ChrizDev - Servidor
echo ========================================================
echo               TuTienda by ChrizDev
echo ========================================================
echo.

echo [1/2] Limpiando puerto 3000 si esta ocupado...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo [!] Encontrado proceso en puerto 3000 - PID %%a. Cerrandolo...
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo [2/2] Iniciando servidor - Frontend y Backend...
echo.
node server.js
if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Hubo un problema al iniciar el servidor.
)
pause
