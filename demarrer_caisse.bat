@echo off
title PARADOU - Caisse Tactile Desktop POS
echo ========================================================
echo    LANCEMENT DE LA CAISSE TACTILE ELECTRON - PARADOU
echo ========================================================
set PATH=C:\laragon\bin\nodejs\node-v22;%PATH%
cd /d "%~dp0"
call npm.cmd start
pause
