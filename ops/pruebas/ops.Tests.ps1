# Pruebas de ops/respaldo.ps1 y ops/vigia.ps1 (Pester 3.4, el que trae Windows PowerShell 5.1).
# No tocan Docker ni discos reales: un "docker" falso (docker.ps1) va delante en el PATH y los discos que faltan
# se simulan con una letra de unidad que no existe en el equipo.
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -Command "Import-Module Pester; Invoke-Pester ops\pruebas"
$ops = Split-Path $PSScriptRoot -Parent
$respaldo = Join-Path $ops 'respaldo.ps1'
$vigia = Join-Path $ops 'vigia.ps1'

# Una letra de unidad que NO existe aqui (simula el USB desconectado).
$usadas = (Get-PSDrive -PSProvider FileSystem).Name
$letra = [char[]]'QRSTUVWXYZ' | Where-Object { $usadas -notcontains [string]$_ } | Select-Object -First 1
$falta = "${letra}:\respaldos\biblioteca"

# docker falso: inspect -> healthy; exec -> ok; cp -> escribe un dump sintetico; ps -> sin contenedores.
$falso = Join-Path ([IO.Path]::GetTempPath()) ("bah-ops-pruebas-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $falso | Out-Null
@'
$a = @($args)
switch ($a[0]) {
    'inspect' { if ($a -contains 'no-existe') { exit 1 }; 'healthy'; exit 0 }
    'exec' { exit 0 }
    'cp' { Set-Content -LiteralPath $a[2] -Value ("dump sintetico de " + $a[1]) -Encoding ascii; exit 0 }
    'ps' { exit 0 }
    default { exit 0 }
}
'@ | Set-Content (Join-Path $falso 'docker.ps1') -Encoding ascii

function Respaldo([string[]]$argumentos) {
    $env:PATH = "$falso;$env:PATH"
    try {
        $salida = & powershell -NoProfile -ExecutionPolicy Bypass -File $respaldo @argumentos 2>&1
        return [pscustomobject]@{ Codigo = $LASTEXITCODE; Salida = ($salida | Out-String) }
    } finally { $env:PATH = $env:PATH.Substring($falso.Length + 1) }
}

function ShaValido([string]$dir) {
    $lineas = Get-Content (Join-Path $dir 'sha256.txt')
    if ($lineas.Count -ne 2) { return $false }
    foreach ($l in $lineas) {
        $hash, $archivo = $l -split '\s+', 2
        if ((Get-FileHash (Join-Path $dir $archivo) -Algorithm SHA256).Hash.ToLower() -ne $hash) { return $false }
    }
    return $true
}

function UltimaLinea([string]$dir) { Get-Content (Join-Path $dir 'respaldo.log') | Select-Object -Last 1 }

function Carpetas([string]$dir) { @(Get-ChildItem $dir -Directory -ErrorAction SilentlyContinue | ForEach-Object Name) }

Describe 'respaldo.ps1' {
    It 'el docker falso se usa (no el real)' {
        $env:PATH = "$falso;$env:PATH"
        try { (& powershell -NoProfile -Command "(Get-Command docker).Source") | Should Be (Join-Path $falso 'docker.ps1') }
        finally { $env:PATH = $env:PATH.Substring($falso.Length + 1) }
    }

    It 'con los dos discos: RESUMEN, exit 0, sha256 valido en principal y espejo' {
        $D = "$TestDrive\ok\principal"; $E = "$TestDrive\ok\espejo"; $L = "$TestDrive\ok\fijo"
        $r = Respaldo @('-Destino', $D, '-Espejo', $E, '-LogFijo', $L, '-Contenedor', 'pg-falso')
        $r.Codigo | Should Be 0
        UltimaLinea $L | Should Match ' RESUMEN: respaldo OK '
        UltimaLinea $D | Should Match ' RESUMEN: '
        ShaValido (Join-Path $D @(Carpetas $D)[0]) | Should Be $true
        ShaValido (Join-Path $E @(Carpetas $E)[0]) | Should Be $true
    }

    It 'V-NUEVO-1: sin el disco principal hace el dump en el espejo, escribe FALLA en C: y sale con 1' {
        $E = "$TestDrive\sinD\espejo"; $L = "$TestDrive\sinD\fijo"
        $r = Respaldo @('-Destino', $falta, '-Espejo', $E, '-LogFijo', $L, '-Contenedor', 'pg-falso')
        $r.Codigo | Should Be 1
        $r.Salida | Should Not Match 'Join-Path'
        UltimaLinea $L | Should Match ' FALLA: principal: destino .* no disponible .*el espejo SI es valido'
        UltimaLinea $E | Should Match ' FALLA: principal: '
        $c = @(Carpetas $E)
        $c.Count | Should Be 1
        $c[0] | Should Match '^\d{4}-\d{2}-\d{2}_\d{4}$'
        ShaValido (Join-Path $E $c[0]) | Should Be $true
    }

    It 'V-NUEVO-1: con el espejo en un disco que falta, el principal vale, FALLA del espejo y exit 1' {
        $D = "$TestDrive\sinE\principal"; $L = "$TestDrive\sinE\fijo"
        $r = Respaldo @('-Destino', $D, '-Espejo', $falta, '-LogFijo', $L, '-Contenedor', 'pg-falso')
        $r.Codigo | Should Be 1
        UltimaLinea $L | Should Match ' FALLA: espejo: .*principal .* SI es valido'
        ShaValido (Join-Path $D @(Carpetas $D)[0]) | Should Be $true
    }

    It 'V-NUEVO-1: sin principal ni espejo, la FALLA queda en el log fijo y sale con 1' {
        $L = "$TestDrive\nada\fijo"
        $r = Respaldo @('-Destino', $falta, '-Espejo', "${letra}:\espejo", '-LogFijo', $L, '-Contenedor', 'pg-falso')
        $r.Codigo | Should Be 1
        UltimaLinea $L | Should Match ' FALLA: principal: destino .* no disponible .*; espejo .* tampoco disponible'
    }

    It 'V-NUEVO-1: -SinEspejo y sin el disco principal: FALLA en el log fijo y exit 1' {
        $L = "$TestDrive\sinEspejo\fijo"
        $r = Respaldo @('-Destino', $falta, '-SinEspejo', '-LogFijo', $L, '-Contenedor', 'pg-falso')
        $r.Codigo | Should Be 1
        UltimaLinea $L | Should Match ' FALLA: .*no hay espejo \(no se creo ninguna carpeta\)'
    }

    It 'sin el disco principal y con la base caida: FALLA con los dos motivos y la carpeta del espejo -FALLIDO' {
        $E = "$TestDrive\sinDcaida\espejo"; $L = "$TestDrive\sinDcaida\fijo"
        $r = Respaldo @('-Destino', $falta, '-Espejo', $E, '-LogFijo', $L, '-Contenedor', 'no-existe')
        $r.Codigo | Should Be 1
        UltimaLinea $L | Should Match ' FALLA: principal: destino .*no esta sano'
        @(Carpetas $E)[0] | Should Match '-FALLIDO$'
    }
}

Describe 'vigia.ps1' {
    It 'V-NUEVO-5: un respaldo en un disco que falta no deja errores de PowerShell y se avisa' {
        $dir = "$TestDrive\vigia"; New-Item -ItemType Directory -Force "$dir\espejo" | Out-Null
        Add-Content "$dir\espejo\respaldo.log" ('{0} RESUMEN: respaldo OK' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
        $env:PATH = "$falso;$env:PATH"
        try {
            $salida = & powershell -NoProfile -ExecutionPolicy Bypass -File $vigia -Proyecto 'pruebas-vigia' -Servicios 'x' `
                -Respaldos "$falta,$dir\espejo" -Discos 'C' -DatosLibros $dir -PuertosTailnet '7050' `
                -Tailscale "$dir\no-hay-tailscale.exe" -Log "$dir\vigia.log" -SinNotificacion 2>&1
        } finally { $env:PATH = $env:PATH.Substring($falso.Length + 1) }
        $errores = @($salida | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] })
        ($errores | Out-String) | Should Be ''
        ($salida | Out-String) | Should Not Match 'Join-Path|Test-Path'
        ($salida | Out-String) | Should Match "AVISO \[respaldo-$letra\]: No se puede leer .*disco ${letra}: no conectado"
        ($salida | Out-String) | Should Not Match 'AVISO \[respaldo\]'
    }

    It 'V-NUEVO-5: si el disco que falta ya esta en -Discos, solo avisa el disco (sin aviso doble)' {
        $dir = "$TestDrive\vigia2"; New-Item -ItemType Directory -Force "$dir\espejo" | Out-Null
        Add-Content "$dir\espejo\respaldo.log" ('{0} RESUMEN: respaldo OK' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
        $env:PATH = "$falso;$env:PATH"
        try {
            $salida = & powershell -NoProfile -ExecutionPolicy Bypass -File $vigia -Proyecto 'pruebas-vigia' -Servicios 'x' `
                -Respaldos "$falta,$dir\espejo" -Discos "C,$letra" -DatosLibros $dir -PuertosTailnet '7050' `
                -Tailscale "$dir\no-hay-tailscale.exe" -Log "$dir\vigia.log" -SinNotificacion 2>&1
        } finally { $env:PATH = $env:PATH.Substring($falso.Length + 1) }
        @($salida | Where-Object { $_ -is [System.Management.Automation.ErrorRecord] }).Count | Should Be 0
        ($salida | Out-String) | Should Match "AVISO \[disco-$letra\]: El disco ${letra}: no esta conectado"
        ($salida | Out-String) | Should Not Match 'AVISO \[respaldo'
    }
}

Remove-Item $falso -Recurse -Force -ErrorAction SilentlyContinue
