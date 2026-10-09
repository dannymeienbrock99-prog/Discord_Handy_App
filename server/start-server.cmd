@echo off
cd /d "%~dp0"
if not exist .env (
  echo Bitte zuerst .env.example als .env kopieren und die eigene Discord-Anwendung eintragen.
  pause
  exit /b 1
)
docker compose up --build -d
docker compose ps
pause
