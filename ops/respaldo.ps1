# Respaldo nocturno de La Biblioteca AH (estandares: pg_dump -Fc + sha256 + rotacion; imprime RESUMEN:/FALLA:).
# Que se respalda:
#   - auth_db y biblioteca_db con pg_dump -Fc (usuarios, ejemplares, progreso, notas, estantes...).
#   - NADA de libros, audio ni portadas: se decidio no copiarlos para no llenar el disco.
# Donde (OP-03, decision de Anderson 2026-11-14): en -Destino (D:, disco USB) y una copia ESPEJO de los dumps en
# -Espejo (C:, disco interno del mismo PC), cada una con su rotacion de -Dias y su sha256 verificado.
# Un respaldo fallido NO deja una carpeta con aspecto de valida: se renombra a AAAA-MM-DD_HHMM-FALLIDO (OP-04).
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File respaldo.ps1 [-Destino D:\respaldos\biblioteca]
#        [-Espejo C:\respaldos-espejo\biblioteca | -SinEspejo] [-Contenedor biblioteca-ah-postgres-1] [-Dias 14]
param(
    [string]$Destino = 'D:\respaldos\biblioteca',
    [string]$Espejo = 'C:\respaldos-espejo\biblioteca',
    [string]$Datos = 'E:\LaBibliotecaAH\datos',
    [string]$Contenedor = 'biblioteca-ah-postgres-1',
    [int]$Dias = 14,
    [switch]$SinEspejo
)
$ErrorActionPreference = 'Stop'
if ($SinEspejo) { $Espejo = '' }
$inicio = Get-Date
$nombre = $inicio.ToString('yyyy-MM-dd_HHmm')
$carpeta = Join-Path $Destino $nombre
$carpetaEspejo = if ($Espejo) { Join-Path $Espejo $nombre } else { $null }
$bases = 'auth_db', 'biblioteca_db'

function Escribir([string]$texto) {
    $linea = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $texto
    Write-Output $linea
    # El log va en cada disco; si uno no esta (USB desconectado), se escribe en el otro.
    foreach ($dir in @($Destino, $Espejo)) {
        if (-not $dir) { continue }
        try {
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force $dir | Out-Null }
            Add-Content -Path (Join-Path $dir 'respaldo.log') -Value $linea -Encoding utf8
        } catch { Write-Output "(no se pudo escribir el log en $dir`: $($_.Exception.Message))" }
    }
}

# Comprueba que cada .dump de la carpeta coincide con su sha256.txt.
function VerificarSha([string]$dir) {
    $lineas = Get-Content (Join-Path $dir 'sha256.txt')
    if ($lineas.Count -ne $bases.Count) { throw "sha256.txt de $dir tiene $($lineas.Count) lineas (esperadas $($bases.Count))" }
    foreach ($l in $lineas) {
        $hash, $archivo = $l -split '\s+', 2
        $real = (Get-FileHash (Join-Path $dir $archivo) -Algorithm SHA256).Hash.ToLower()
        if ($real -ne $hash) { throw "sha256 no coincide en $dir\$archivo" }
    }
}

# Marca una carpeta a medias para que nadie la tome por un respaldo valido (y si no se puede, la borra).
function MarcarFallida([string]$dir) {
    if (-not $dir -or -not (Test-Path $dir)) { return }
    try { Rename-Item $dir ((Split-Path $dir -Leaf) + '-FALLIDO') -ErrorAction Stop }
    catch { Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue }
}

# Rotacion por la fecha del NOMBRE (no por LastWriteTime): AAAA-MM-DD_HHMM y AAAA-MM-DD_HHMM-FALLIDO.
# Cualquier otra carpeta (p. ej. "manual-no-borrar") se respeta.
function Rotar([string]$dir) {
    $n = 0
    if (-not $dir -or -not (Test-Path $dir)) { return 0 }
    $limite = $inicio.AddDays(-$Dias)
    Get-ChildItem $dir -Directory | ForEach-Object {
        if ($_.Name -match '^(\d{4}-\d{2}-\d{2}_\d{4})(-FALLIDO)?$') {
            $fecha = [datetime]::ParseExact($Matches[1], 'yyyy-MM-dd_HHmm', $null)
            if ($fecha -lt $limite) { Remove-Item $_.FullName -Recurse -Force; $n++ }
        }
    }
    return $n
}

$fase = 'principal'
try {
    New-Item -ItemType Directory -Force $carpeta | Out-Null

    $estado = docker inspect -f '{{.State.Health.Status}}' $Contenedor 2>$null
    if ($estado -ne 'healthy') { throw "el contenedor $Contenedor no esta sano (estado: '$estado')" }

    foreach ($db in $bases) {
        $dentro = "/tmp/$db.dump"
        docker exec $Contenedor sh -c "pg_dump -U `"`$POSTGRES_USER`" -Fc -f $dentro $db"
        if ($LASTEXITCODE -ne 0) { throw "pg_dump de $db fallo (codigo $LASTEXITCODE)" }
        # El dump se puede leer entero (OP-22): pg_restore --list recorre su indice.
        docker exec $Contenedor pg_restore --list $dentro | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "pg_restore --list de $db fallo: el dump no es legible" }
        docker cp "${Contenedor}:$dentro" (Join-Path $carpeta "$db.dump") | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "docker cp de $db fallo" }
        docker exec $Contenedor rm -f $dentro | Out-Null
    }

    Get-ChildItem $carpeta -Filter *.dump | ForEach-Object {
        '{0}  {1}' -f (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLower(), $_.Name
    } | Set-Content (Join-Path $carpeta 'sha256.txt') -Encoding ascii
    VerificarSha $carpeta

    # Los LIBROS no se copian (decision de Anderson, 2026-11-11): una copia de la biblioteca
    # gastaria el almacenamiento del servidor. Solo se respaldan las bases.

    # Aviso si el respaldo encoge mucho respecto al anterior valido (posible base vaciada).
    $mb = [math]::Round(((Get-ChildItem $carpeta -File | Measure-Object Length -Sum).Sum / 1MB), 2)
    $aviso = ''
    $anterior = Get-ChildItem $Destino -Directory | Where-Object { $_.Name -match '^\d{4}-\d{2}-\d{2}_\d{4}$' -and $_.Name -ne $nombre } |
        Sort-Object Name | Select-Object -Last 1
    if ($anterior) {
        $mbAnt = (Get-ChildItem $anterior.FullName -Filter *.dump | Measure-Object Length -Sum).Sum / 1MB
        if ($mbAnt -gt 0 -and $mb -lt $mbAnt * 0.5) { $aviso = " AVISO: ocupa menos de la mitad que el anterior ($([math]::Round($mbAnt, 2)) MB)" }
    }

    $borradas = Rotar $Destino

    $fase = 'espejo'
    $textoEspejo = 'sin espejo'
    if ($carpetaEspejo) {
        New-Item -ItemType Directory -Force $carpetaEspejo | Out-Null
        Copy-Item (Join-Path $carpeta '*') $carpetaEspejo -Force
        VerificarSha $carpetaEspejo
        $textoEspejo = "espejo OK en $carpetaEspejo (sha256 verificado), $(Rotar $Espejo) rotados"
    }

    Escribir "RESUMEN: respaldo OK en $carpeta ($mb MB de bases, sin libros), $borradas respaldos viejos rotados (> $Dias dias); $textoEspejo.$aviso"
    exit 0
} catch {
    if ($fase -eq 'principal') {
        MarcarFallida $carpeta
        Escribir "FALLA: $($_.Exception.Message) (carpeta marcada -FALLIDO)"
    } else {
        MarcarFallida $carpetaEspejo
        Escribir "FALLA: espejo: $($_.Exception.Message) (el respaldo principal en $carpeta SI es valido)"
    }
    exit 1
}
