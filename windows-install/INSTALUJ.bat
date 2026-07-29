@echo off
chcp 65001 >nul
title AGentHub-Grok — instalator Windows
cd /d "%~dp0"

net session >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo  [!] Uruchom to jako Administrator.
  echo      Prawy przycisk na INSTALUJ.bat → "Uruchom jako administrator"
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALUJ.ps1"
set ERR=%ERRORLEVEL%
echo.
if %ERR% neq 0 (
  echo Instalacja zakończona z kodem %ERR%.
) else (
  echo Gotowe.
)
pause
exit /b %ERR%
