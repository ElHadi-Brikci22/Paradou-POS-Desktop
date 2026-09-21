@echo off
title PARADOU - Caisse Tactile Desktop POS
set "BASE_DIR=%~dp0.."
cd /d "%BASE_DIR%"

echo ===================================================================
echo     LANCEMENT DE L'APPLICATION CAISSE DESKTOP ELECTRON - PARADOU
echo ===================================================================

:: 1. Recherche du binaire PHP (Laragon ou PATH systeme)
set "PHP_EXE=php.exe"
if exist "C:\laragon\bin\php" (
    for /d %%D in ("C:\laragon\bin\php\php-8*") do (
        if exist "%%D\php.exe" set "PHP_EXE=%%D\php.exe"
    )
)

:: 2. Recherche du binaire MySQL (Laragon)
set "MYSQLD_EXE="
if exist "C:\laragon\bin\mysql" (
    for /d %%D in ("C:\laragon\bin\mysql\mysql-*") do (
        if exist "%%D\bin\mysqld.exe" set "MYSQLD_EXE=%%D\bin\mysqld.exe"
    )
)

:: 3. Demarrer MySQL s'il ne tourne pas deja
tasklist /FI "IMAGENAME eq mysqld.exe" 2>NUL | find /I /N "mysqld.exe">NUL
if "%ERRORLEVEL%"=="1" (
    if defined MYSQLD_EXE (
        echo [*] Demarrage de la base de donnees MySQL...
        start "" /b "%MYSQLD_EXE%" --standalone
        timeout /t 2 /nobreak >nul
    )
)

:: 4. Demarrer PHP Artisan Serve sur le port 8000 s'il n'est pas deja actif
netstat -ano | findstr :8000 | findstr LISTENING >nul
if "%ERRORLEVEL%"=="1" (
    echo [*] Demarrage du serveur d'application Paradou sur le port 8000...
    start "" /b "%PHP_EXE%" artisan serve --host=127.0.0.1 --port=8000
    timeout /t 2 /nobreak >nul
)

:: 5. Lancement de l'application native Electron
echo [*] Lancement de la caisse tactile native Electron...
set PATH=C:\laragon\bin\nodejs\node-v22;%PATH%
cd /d "%~dp0"
call npm.cmd start
