# Gera áudio de teste em inglês (voz do orador) — 16 kHz, 16-bit, mono
Add-Type -AssemblyName System.Speech

$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
    16000,
    [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono)

$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SelectVoice('Microsoft David Desktop')
$s.Rate = 0

$out = Join-Path $PSScriptRoot '..\test-audio\orador-en.wav'
New-Item -ItemType Directory -Force -Path (Split-Path $out) | Out-Null
$s.SetOutputToWaveFile($out, $fmt)

$s.Speak("Good evening, brothers and sisters. Tonight I want to talk to you about hope. Even when life feels heavy, and the road ahead seems uncertain, we are never walking alone. Faith is not the absence of fear. It is the decision to keep moving forward, one step at a time. Let us open our hearts and begin.")

$s.Dispose()
Write-Host "OK: $out"
