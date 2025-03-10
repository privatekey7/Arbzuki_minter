@echo off
chcp 65001 > nul

:: Включаем поддержку ANSI цветов
reg query HKCU\Console /v VirtualTerminalLevel 2>nul | find "0x1" >nul
if %ERRORLEVEL% NEQ 0 (
    reg add HKCU\Console /v VirtualTerminalLevel /t REG_DWORD /d 1 /f >nul
)

:: Цвета
set "cyan=[36m"
set "red=[31m"
set "green=[32m"
set "yellow=[33m"
set "blue=[34m"
set "reset=[0m"

echo %cyan%[ИНФО] Проверка наличия Node.js...%reset%
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo %red%[ОШИБКА] Node.js не установлен!
    echo %red%Пожалуйста, установите Node.js с сайта: https://nodejs.org/%reset%
    echo.
    pause
    exit /b 1
)

echo %cyan%[ИНФО] Проверка наличия npm...%reset%
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo %red%[ОШИБКА] npm не установлен!
    echo %red%Пожалуйста, переустановите Node.js с сайта: https://nodejs.org/%reset%
    echo.
    pause
    exit /b 1
)

echo %cyan%[ИНФО] Проверка наличия файла package.json...%reset%
if not exist package.json (
    echo %red%[ОШИБКА] Файл package.json не найден!%reset%
    echo.
    pause
    exit /b 1
)

echo %cyan%[ИНФО] Проверка наличия файла keys.txt...%reset%
if not exist keys.txt (
    echo %red%[ОШИБКА] Файл keys.txt не найден!
    echo %red%Пожалуйста, создайте файл keys.txt и добавьте в него ваш приватный ключ%reset%
    echo.
    pause
    exit /b 1
)

echo %cyan%[ИНФО] Проверка установленных зависимостей...%reset%
if not exist node_modules (
    echo %blue%[ПРОЦЕСС] Установка зависимостей...%reset%
    call npm install
    if %errorlevel% neq 0 (
        echo %red%[ОШИБКА] Не удалось установить зависимости!%reset%
        echo.
        pause
        exit /b 1
    )
    echo %green%[УСПЕХ] Зависимости успешно установлены!%reset%
    echo.
) else (
    echo %green%[УСПЕХ] Зависимости уже установлены%reset%
)

echo.
echo %blue%[ПРОЦЕСС] Запуск скрипта минта Arbzukiswap NFT...%reset%
echo.
node mintNFT.js
echo.
pause 