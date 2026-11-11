# Ejecuta un script dentro de la sesion de Windows de ander en el PC de casa.
# Por que: Docker Desktop resuelve credenciales con el gestor de Windows, que no existe en sesiones SSH
# ("A specified logon session does not exist"), asi que docker build/pull fallan por SSH. Esta tarea
# programada (BibliotecaAH-Sesion, LogonType Interactive, sin elevar) corre en la sesion abierta.
#
# Uso desde SSH:
#   1. escribir el trabajo en  C:\srv\biblioteca-ah\sesion\pendiente.ps1
#   2. schtasks /run /tn BibliotecaAH-Sesion
#   3. esperar C:\srv\biblioteca-ah\sesion\fin.txt (codigo de salida); la salida queda en salida.log
# Solo ejecuta ese archivo fijo, que solo puede escribir ander.
$base = 'C:\srv\biblioteca-ah\sesion'
$trabajo = Join-Path $base 'pendiente.ps1'
$salida = Join-Path $base 'salida.log'
$fin = Join-Path $base 'fin.txt'
if (-not (Test-Path $trabajo)) { exit 0 }
Remove-Item $fin, $salida -Force -ErrorAction SilentlyContinue
$enCurso = Join-Path $base 'en-curso.ps1'
Move-Item $trabajo $enCurso -Force
$codigo = 1
try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $enCurso *>&1 | Out-File -FilePath $salida -Encoding utf8
    $codigo = $LASTEXITCODE
} catch {
    "FALLA: $($_.Exception.Message)" | Out-File -FilePath $salida -Append -Encoding utf8
}
"$codigo" | Set-Content $fin -Encoding ascii
