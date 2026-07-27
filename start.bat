@echo off
chcp 65001 >nul
title Цели и Настроение - запуск
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [Ошибка] Node.js не найден на этом компьютере.
  echo Скачай и установи Node.js (LTS) с сайта https://nodejs.org
  echo Затем снова запусти этот файл.
  echo.
  pause
  exit /b
)

echo Запускаю сервер...
start "Сервер: Цели и Настроение" cmd /k "node server.js"

timeout /t 2 /nobreak >nul
start "" "http://localhost:3838"

exit
