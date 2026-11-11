# Sintetiza cada frase de entrada.json a un WAV (11025 Hz, 16 bits, mono) con la voz
# española de Windows (Microsoft Helena) y anota los tiempos de cada palabra.
# Uso: powershell -File voz.ps1 -Entrada frases.json -Salida carpeta
# Solo la usa scripts/generar-demo.mjs. No forma parte de la app.
param([string]$Entrada, [string]$Salida)

Add-Type -AssemblyName System.Speech
$frases = Get-Content -Raw -Encoding UTF8 $Entrada | ConvertFrom-Json
New-Item -ItemType Directory -Force $Salida | Out-Null

$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voz = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'es-ES' } | Select-Object -First 1
if (-not $voz) { $voz = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.TwoLetterISOLanguageName -eq 'es' } | Select-Object -First 1 }
if ($voz) { $s.SelectVoice($voz.VoiceInfo.Name) }
$s.Rate = 0

$formato = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(11025, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$global:palabras = New-Object System.Collections.ArrayList
Register-ObjectEvent -InputObject $s -EventName SpeakProgress -SourceIdentifier bahProgreso | Out-Null

$resultado = @()
foreach ($f in $frases) {
  $global:palabras.Clear()
  $wav = Join-Path $Salida ($f.id + '.wav')
  $s.SetOutputToWaveFile($wav, $formato)
  $s.Speak([string]$f.texto)
  $s.SetOutputToNull()
  Start-Sleep -Milliseconds 30
  $eventos = Get-Event -SourceIdentifier bahProgreso -ErrorAction SilentlyContinue
  $lista = @()
  foreach ($e in $eventos) {
    $a = $e.SourceEventArgs
    $lista += ,@($a.CharacterPosition, ($a.CharacterPosition + $a.CharacterCount), $a.AudioPosition.TotalSeconds)
    Remove-Event -EventIdentifier $e.EventIdentifier
  }
  $resultado += [pscustomobject]@{ id = $f.id; palabras = $lista }
}
Unregister-Event -SourceIdentifier bahProgreso
$resultado | ConvertTo-Json -Depth 6 | Out-File -Encoding utf8 (Join-Path $Salida 'progreso.json')
Write-Output ("Frases sintetizadas: " + $frases.Count + " con la voz " + $s.Voice.Name)
