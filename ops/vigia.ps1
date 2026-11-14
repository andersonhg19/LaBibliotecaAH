# Vigia de La Biblioteca AH (OP-04): cada 10 min (tarea BibliotecaAH-Vigia, ver ops/instalar-vigia.ps1) comprueba
#   - que los contenedores del proyecto existen, corren y estan "healthy";
#   - que el ultimo respaldo es RESUMEN (no FALLA, sin AVISO) y tiene menos de -HorasRespaldo;
#   - el espacio libre de C:, D: y E: (y que D:/E:, discos USB, siguen conectados);
#   - que E: esta montado (existe la carpeta de datos de los libros);
#   - que 7050/7051 siguen publicados en la tailnet y NUNCA aparecen en Funnel (internet publico).
# Si algo falla: notificacion de Windows (API nativa de WinRT, sin paquetes) y una linea en -Log. El mismo aviso no se
# repite mas de una vez por hora (estado en vigia-estado.json junto al log); cuando se arregla, avisa "RESUELTO".
# Solo LEE: docker ps/inspect, logs de respaldo, discos y `tailscale serve status`. No reinicia ni cambia nada.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File vigia.ps1 [-Proyecto biblioteca-ah] [-Log ...]
param(
    [string]$Proyecto = 'biblioteca-ah',
    [string[]]$Servicios = @('postgres', 'discovery-service', 'gateway-service', 'auth-service', 'biblioteca-service',
        'taller', 'traductor', 'frontend'),
    [string[]]$Respaldos = @('D:\respaldos\biblioteca', 'C:\respaldos-espejo\biblioteca'),
    [int]$HorasRespaldo = 26,
    [string[]]$Discos = @('C', 'D', 'E'),
    [int]$MinLibrePct = 10,
    [int]$MinLibreGB = 20,
    [string]$DatosLibros = 'E:\LaBibliotecaAH\datos',
    [string[]]$PuertosTailnet = @('7050', '7051'),
    [string]$Tailscale = 'C:\Program Files\Tailscale\tailscale.exe',
    [string]$Log = 'C:\srv\biblioteca-ah\vigia.log',
    [int]$MinutosEntreAvisos = 60,
    [string]$Titulo = 'La Biblioteca AH',
    [switch]$SinNotificacion
)
$ErrorActionPreference = 'Continue'
# Con -File las listas llegan como "a,b": se separan aqui.
$Servicios = $Servicios -split ',' | Where-Object { $_ }
$Respaldos = $Respaldos -split ',' | Where-Object { $_ }
$Discos = $Discos -split ',' | Where-Object { $_ }
$PuertosTailnet = @($PuertosTailnet -split ',' | Where-Object { $_ } | ForEach-Object { [int]$_ })
$ahora = Get-Date
$dirLog = Split-Path $Log -Parent
if (-not (Test-Path $dirLog)) { New-Item -ItemType Directory -Force $dirLog | Out-Null }
$archivoEstado = Join-Path $dirLog 'vigia-estado.json'

function Escribir([string]$texto) {
    $linea = '{0} {1}' -f ($ahora.ToString('yyyy-MM-dd HH:mm:ss')), $texto
    Write-Output $linea
    try {
        # Rotacion simple: al pasar de 2 MB se guarda una generacion (.1).
        if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 2MB) { Move-Item $Log "$Log.1" -Force }
        Add-Content -Path $Log -Value $linea -Encoding utf8
    } catch { Write-Output "(no se pudo escribir $Log`: $($_.Exception.Message))" }
}

# Notificacion de Windows con la API nativa (WinRT) de PowerShell 5.1. Solo se ve si la tarea corre en la sesion
# de ander (LogonType Interactive). Si no se puede, queda en el log.
function Notificar([string]$texto) {
    if ($SinNotificacion) { return 'desactivada' }
    try {
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
        [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
        $esc = { param($s) [System.Security.SecurityElement]::Escape($s) }
        $xml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $xml.LoadXml("<toast scenario=`"reminder`"><visual><binding template=`"ToastGeneric`"><text>$(& $esc $Titulo)</text><text>$(& $esc $texto)</text></binding></visual><actions><action content=`"Entendido`" arguments=`"ok`" activationType=`"system`"/></actions></toast>")
        $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
        [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show(
            [Windows.UI.Notifications.ToastNotification]::new($xml))
        return 'notificacion'
    } catch {
        # Plan B: msg.exe (no existe en Windows Home).
        $msg = Join-Path $env:SystemRoot 'System32\msg.exe'
        if (Test-Path $msg) { & $msg $env:USERNAME /time:3600 "$Titulo`n$texto" 2>$null; if ($LASTEXITCODE -eq 0) { return 'msg' } }
        return "sin aviso visible ($($_.Exception.Message))"
    }
}

$problemas = [ordered]@{}   # clave -> texto

# 1. Contenedores
$lineas = docker ps -a --filter "label=com.docker.compose.project=$Proyecto" --format '{{.ID}}' 2>$null
if ($LASTEXITCODE -ne 0) {
    $problemas['docker'] = 'Docker no responde (Docker Desktop caido o sin arrancar)'
} else {
    $vistos = @{}
    if ($lineas) {
        # JSON completo de docker inspect (PowerShell 5.1 se come las comillas de una plantilla -f con index).
        ((docker inspect $lineas 2>$null) | Out-String | ConvertFrom-Json) |
            ForEach-Object {
                $s = $_.Config.Labels.'com.docker.compose.service'
                $estado = $_.State.Status
                $salud = if ($_.State.Health) { $_.State.Health.Status } else { 'sin-healthcheck' }
                $vistos[$s] = $true
                $minutos = ($ahora.ToUniversalTime() - [datetime]::Parse($_.State.StartedAt).ToUniversalTime()).TotalMinutes
                if ($estado -ne 'running') { $problemas["contenedor-$s"] = "El servicio $s esta '$estado'" }
                elseif ($salud -eq 'unhealthy') { $problemas["contenedor-$s"] = "El servicio $s esta unhealthy" }
                elseif ($salud -eq 'starting' -and $minutos -gt 10) { $problemas["contenedor-$s"] = "El servicio $s lleva $([int]$minutos) min arrancando" }
            }
    }
    foreach ($s in $Servicios) {
        if (-not $vistos.ContainsKey($s)) { $problemas["contenedor-$s"] = "No existe el contenedor del servicio $s ($Proyecto)" }
    }
}

# 2. Respaldo: la linea mas reciente de los respaldo.log (principal y espejo).
$ultimas = foreach ($r in $Respaldos) {
    $f = Join-Path $r 'respaldo.log'
    if (Test-Path $f) {
        Get-Content $f -Encoding utf8 | Where-Object { $_ -match '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} ' } | Select-Object -Last 1
    }
}
$ultima = $ultimas | Sort-Object | Select-Object -Last 1
if (-not $ultima) {
    $problemas['respaldo'] = "No hay respaldo.log en $($Respaldos -join ' ni en ')"
} else {
    $fecha = [datetime]::ParseExact($ultima.Substring(0, 19), 'yyyy-MM-dd HH:mm:ss', $null)
    $horas = [math]::Round(($ahora - $fecha).TotalHours, 1)
    if ($ultima -match ' FALLA: ') { $problemas['respaldo'] = "El ultimo respaldo FALLO: $($ultima.Substring(20))" }
    elseif ($horas -gt $HorasRespaldo) { $problemas['respaldo'] = "El ultimo respaldo es de hace $horas h (limite $HorasRespaldo h)" }
    elseif ($ultima -match 'AVISO: ') { $problemas['respaldo'] = "El ultimo respaldo trae un aviso: $($ultima -replace '^.*AVISO: ', '')" }
}

# 3. Discos: conectados y con espacio.
foreach ($d in $Discos) {
    $u = Get-PSDrive -Name $d -PSProvider FileSystem -ErrorAction SilentlyContinue
    if (-not $u -or ($u.Used + $u.Free) -eq 0) { $problemas["disco-$d"] = "El disco $d`: no esta conectado"; continue }
    $libreGB = [math]::Round($u.Free / 1GB, 1)
    $pct = [math]::Round(100 * $u.Free / ($u.Used + $u.Free), 1)
    if ($pct -lt $MinLibrePct -or $libreGB -lt $MinLibreGB) { $problemas["disco-$d"] = "Queda poco espacio en $d`: $libreGB GB ($pct %)" }
}

# 4. Libros (E:) montados.
if (-not (Test-Path $DatosLibros)) { $problemas['libros'] = "No se ve $DatosLibros (disco de los libros desconectado)" }

# 5. Tailscale: la web y la API solo en la tailnet, nunca en Funnel.
if ($PuertosTailnet.Count -gt 0) {
    try {
        $ts = (& $Tailscale serve status --json 2>$null | Out-String) | ConvertFrom-Json
        $funnel = @()
        if ($ts.AllowFunnel) { $funnel = $ts.AllowFunnel.PSObject.Properties | Where-Object { $_.Value } | ForEach-Object { [int]($_.Name -replace '^.*:', '') } }
        $tcp = @(); if ($ts.TCP) { $tcp = $ts.TCP.PSObject.Properties.Name | ForEach-Object { [int]$_ } }
        foreach ($p in $PuertosTailnet) {
            if ($funnel -contains $p) { $problemas["funnel-$p"] = "PELIGRO: el puerto $p esta en Funnel (internet publico). Quitar: tailscale funnel --https=$p off" }
            if ($tcp -notcontains $p) { $problemas["tailnet-$p"] = "El puerto $p ya no esta publicado en la tailnet (tailscale serve)" }
        }
    } catch { $problemas['tailscale'] = "No se pudo leer tailscale serve status: $($_.Exception.Message)" }
}

# Avisos: uno por clave y por hora como mucho; "RESUELTO" cuando desaparece.
$estado = @{}
if (Test-Path $archivoEstado) {
    try { (Get-Content $archivoEstado -Raw | ConvertFrom-Json).PSObject.Properties | ForEach-Object { $estado[$_.Name] = [datetime]$_.Value } }
    catch { $estado = @{} }
}
$nuevoEstado = @{}
foreach ($k in $problemas.Keys) {
    $ultimoAviso = $estado[$k]
    if ($ultimoAviso -and ($ahora - $ultimoAviso).TotalMinutes -lt $MinutosEntreAvisos) {
        $nuevoEstado[$k] = $ultimoAviso
        Escribir "SIGUE [$k]: $($problemas[$k]) (ya avisado a las $($ultimoAviso.ToString('HH:mm')))"
    } else {
        $via = Notificar $problemas[$k]
        $nuevoEstado[$k] = $ahora
        Escribir "AVISO [$k]: $($problemas[$k]) ($via)"
    }
}
foreach ($k in $estado.Keys) {
    if (-not $problemas.Contains($k)) {
        $via = Notificar "Resuelto: $k"
        Escribir "RESUELTO [$k] ($via)"
    }
}
$json = @{}; foreach ($k in $nuevoEstado.Keys) { $json[$k] = $nuevoEstado[$k].ToString('o') }
($json | ConvertTo-Json) | Set-Content $archivoEstado -Encoding utf8
if ($problemas.Count -eq 0) { Escribir "OK: $Proyecto sano, respaldo al dia, discos y tailnet en orden" }
exit ([int]($problemas.Count -gt 0))
