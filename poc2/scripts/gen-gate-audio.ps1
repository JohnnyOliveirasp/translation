# Gera os 2 áudios do gate da Fase 1 — 16 kHz, 16-bit, mono
# 1) sermao-teologico-en.wav  — 1 voz, carregado de termos do glossário + citações (G1/G2)
# 2) dialogo-en.wav           — 2 vozes alternando (G4, diarização)
Add-Type -AssemblyName System.Speech

$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(
    16000,
    [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,
    [System.Speech.AudioFormat.AudioChannel]::Mono)

$outDir = Join-Path $PSScriptRoot '..\test-audio'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.Rate = 0

function Speak-Turn($synth, $voice, $text, $breakMs) {
    $synth.SelectVoice($voice)
    $b = New-Object System.Speech.Synthesis.PromptBuilder
    $b.AppendText($text)
    if ($breakMs -gt 0) { $b.AppendBreak([TimeSpan]::FromMilliseconds($breakMs)) }
    $synth.Speak($b)
}

# ---------- 1) Sermão teológico (G1 terminologia + G2 citações) ----------
$out1 = Join-Path $outDir 'sermao-teologico-en.wav'
$s.SetOutputToWaveFile($out1, $fmt)
Speak-Turn $s 'Microsoft David Desktop' ("Open your Bibles with me to John chapter three, verse sixteen. " +
    "For God so loved the world, that he gave his only begotten Son, that whosoever believes in him " +
    "should not perish, but have everlasting life.") 600
Speak-Turn $s 'Microsoft David Desktop' ("Church, this is the gospel. By grace you have been saved, through faith. " +
    "The atonement of Christ brings justification and righteousness to every sinner who repents.") 600
Speak-Turn $s 'Microsoft David Desktop' ("Jesus told Nicodemus, unless you are born again, you cannot see the Kingdom of God. " +
    "The book of James, chapter one, verse two, says: count it all joy, my brothers, when you fall into various trials.") 600
Speak-Turn $s 'Microsoft David Desktop' ("Paul wrote to the Romans that the wages of sin is death, " +
    "but the gift of God is eternal life. We were redeemed by the blood of the Lamb. " +
    "Sanctification is a daily walk with the Holy Spirit. Hallelujah. Amen.") 0
$s.SetOutputToNull()
Write-Host "OK: $out1"

# ---------- 2) Diálogo pastor + convidada (G4 diarização) ----------
$out2 = Join-Path $outDir 'dialogo-en.wav'
$s.SetOutputToWaveFile($out2, $fmt)
Speak-Turn $s 'Microsoft David Desktop' ("Tonight we have a special guest with us. " +
    "Sister, tell us how the Lord has been working in your life.") 800
Speak-Turn $s 'Microsoft Zira Desktop' ("Thank you, Pastor. Two years ago I was far from God. " +
    "But someone shared the gospel with me, and I was born again.") 800
Speak-Turn $s 'Microsoft David Desktop' ("Hallelujah! And what scripture carried you through that season?") 800
Speak-Turn $s 'Microsoft Zira Desktop' ("Isaiah, chapter forty one, verse ten. Fear not, for I am with you. " +
    "That verse changed everything for me.") 800
Speak-Turn $s 'Microsoft David Desktop' ("Amen. The grace of the Lord is sufficient. Let us give thanks together.") 0
$s.SetOutputToNull()
Write-Host "OK: $out2"

$s.Dispose()
