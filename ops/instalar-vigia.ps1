# Registra la tarea programada BibliotecaAH-Vigia (OP-04): ejecuta vigia.ps1 cada 10 minutos y al iniciar sesion,
# en la sesion de ander (LogonType Interactive, sin elevar) para que las notificaciones de Windows se vean.
# Sin parametros solo MUESTRA lo que haria (no cambia nada). Para instalar de verdad, en casa:
#   powershell -NoProfile -ExecutionPolicy Bypass -File C:\srv\biblioteca-ah\instalar-vigia.ps1 -Instalar
# Para quitarla: ... -Desinstalar
param(
    [string]$Script = 'C:\srv\biblioteca-ah\vigia.ps1',
    [string]$Nombre = 'BibliotecaAH-Vigia',
    [string]$Usuario = 'ander',
    [int]$Minutos = 10,
    [switch]$Instalar,
    [switch]$Desinstalar
)
$ErrorActionPreference = 'Stop'

if ($Desinstalar) {
    Unregister-ScheduledTask -TaskName $Nombre -Confirm:$false
    "Tarea $Nombre eliminada."
    exit 0
}

if (-not (Test-Path $Script)) { throw "No existe $Script (copiar antes ops/vigia.ps1 ahi)" }

# conhost --headless: sin ventana que parpadee cada 10 min (con -WindowStyle Hidden se ve un instante).
# El codigo de salida no llega a la tarea; la fuente de verdad es vigia.log.
$accion = New-ScheduledTaskAction -Execute 'conhost.exe' `
    -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$Script`""
$cada = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes $Minutos)
$alEntrar = New-ScheduledTaskTrigger -AtLogOn -User $Usuario
$quien = New-ScheduledTaskPrincipal -UserId $Usuario -LogonType Interactive -RunLevel Limited
$ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$tarea = New-ScheduledTask -Action $accion -Trigger $cada, $alEntrar -Principal $quien -Settings $ajustes `
    -Description 'La Biblioteca AH: vigia de contenedores, respaldo, discos y Tailscale (ops/vigia.ps1). Log: vigia.log'

"Tarea: $Nombre"
"  Accion:   $($accion.Execute) $($accion.Arguments)"
"  Disparos: cada $Minutos min desde $((Get-Date).Date.ToString('yyyy-MM-dd HH:mm')) (indefinido) y al iniciar sesion $Usuario"
"  Usuario:  $Usuario, Interactive, sin elevar; maximo 5 min por ejecucion; no se solapan"
if (-not $Instalar) { "(solo se muestra; con -Instalar se registra)"; exit 0 }

Register-ScheduledTask -TaskName $Nombre -InputObject $tarea -Force | Out-Null
Start-ScheduledTask -TaskName $Nombre
"Tarea $Nombre registrada y lanzada una vez. Comprobar: Get-Content $(Join-Path (Split-Path $Script) 'vigia.log') -Tail 5"
