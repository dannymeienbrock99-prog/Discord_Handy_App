@echo off
setlocal
cd /d "%~dp0"
dotnet restore Modstempel.Verwaltung.csproj
if errorlevel 1 exit /b 1
dotnet build Modstempel.Verwaltung.csproj -c Release --no-restore
if errorlevel 1 exit /b 1
echo Die Windows-App liegt in bin\Release\net48\Crazy_Batto-Discord-App-Verwaltung.exe
echo Zum Verteilen alle zugehoerigen DLLs und die Unterordner x64, x86 und arm64 beilegen.
