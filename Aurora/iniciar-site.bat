@echo off
chcp 65001 >nul
echo Iniciando servidor do site Aurora Pink...
echo.

REM Tenta encontrar Python em locais comuns
set PYTHON_PATHS=%ProgramFiles%\Python311\python.exe %ProgramFiles%\Python310\python.exe %ProgramFiles%\Python39\python.exe %LocalAppData%\Programs\Python\Python311\python.exe C:\Python311\python.exe C:\Python310\python.exe

for %%P in (%PYTHON_PATHS%) do (
    if exist "%%P" (
        echo.
        echo ✓ Python encontrado! Iniciando servidor...
        echo.
        echo Acesse o site em: http://localhost:8000
        echo.
        cd /d "%~dp0"
        "%%P" -m http.server 8000
        exit /b
    )
)

REM Se Python não foi encontrado, tenta Node.js
for %%P in (node.exe) do (
    set NODE_PATH=%%~$PATH:P
    if not "!NODE_PATH!"=="" (
        echo ✓ Node.js encontrado! Iniciando servidor...
        echo.
        echo Acesse o site em: http://localhost:8000
        echo.
        cd /d "%~dp0"
        npx http-server -p 8000 -c-1
        exit /b
    )
)

REM Se nenhum foi achado, mostra mensagem
echo.
echo ✗ Nenhuma ferramenta encontrada para rodar o servidor.
echo.
echo Solução: Instale Node.js em https://nodejs.org/
echo.
echo Depois reabra este arquivo (iniciar-site.bat)
echo.
pause
