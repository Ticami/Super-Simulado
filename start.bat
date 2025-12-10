@echo off
cd /d "%~dp0"
echo Iniciando Super-Simulado...

if not exist node_modules (
  echo Instalando dependencias...
  call npm install
)

call npm start

echo.
echo Pressione qualquer tecla para fechar...
pause >nul
