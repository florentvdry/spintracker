@echo off
echo ====================================
echo Poker Tracker - Backend C# Setup
echo ====================================
echo.

REM Check if .NET 8 is installed
dotnet --version >nul 2>&1
if %errorlevel% neq 0 (
    echo .NET 8 SDK not found!
    echo.
    echo Please install .NET 8 SDK from:
    echo https://dotnet.microsoft.com/download/dotnet/8.0
    echo.
    echo After installation, run this script again.
    pause
    exit /b 1
)

echo .NET SDK found!
dotnet --version
echo.

REM Build the project
echo Building backend...
dotnet build
if %errorlevel% neq 0 (
    echo Build failed!
    pause
    exit /b 1
)

echo.
echo Build successful!
echo.
echo Starting backend on port 5050...
echo.
dotnet run 5050
