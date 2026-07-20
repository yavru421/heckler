param(
    [Parameter(Mandatory=$true)]
    [string]$Text,
    [Parameter(Mandatory=$true)]
    [string]$OutputFile
)

Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer

# Determine best installed voice (Zira is high-quality female, David is male)
$voices = $synth.GetInstalledVoices()
$voice = $voices | Where-Object { $_.VoiceInfo.Name -match "Zira" -or $_.VoiceInfo.Name -match "David" -or $_.VoiceInfo.Name -match "Hazel" } | Select-Object -First 1

if ($voice) {
    $synth.SelectVoice($voice.VoiceInfo.Name)
    Write-Output "Selected voice: $($voice.VoiceInfo.Name)"
} else {
    Write-Output "Using default system voice"
}

# Output to target WAV file path
$synth.SetOutputToWaveFile($OutputFile)
$synth.Speak($Text)
$synth.Dispose()

Write-Output "Successfully generated offline speech audio file at $OutputFile"
