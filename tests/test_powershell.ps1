# Tests PowerShell 5.1 / 7+ sans WSL installe, sans GPU ni reseau externe.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$Root=Split-Path -Parent $PSScriptRoot
$Script=Join-Path $Root 'selfhost\sparktiates-windows.ps1'
if (-not (Test-Path -LiteralPath $Script)) { throw "FICHIER_POWERSHELL_ABSENT" }
$Checks=0

function Assert-Contains([string]$Content,[string]$Expected) {
  if (-not $Content.Contains($Expected)) {
    throw ("TEST_ECHOUE_MISSING={0}" -f $Expected)
  }
  $script:Checks++
}
function Assert-NotContains([string]$Content,[string]$Forbidden) {
  if ($Content.Contains($Forbidden)) {
    throw ("TEST_ECHOUE_FORBIDDEN={0}" -f $Forbidden)
  }
  $script:Checks++
}

$audit = (& $Script -Mode Audit | Out-String)
Assert-Contains $audit 'MODE=Audit'
Assert-Contains $audit 'COMPUTE_CREATED=0'
Assert-Contains $audit 'RADIO_PUBLIQUE=UNCHANGED'
Assert-Contains $audit 'NETWORK_REQUESTS=0'
Assert-Contains $audit 'CLUSTER_REAL_CAPACITY=NOT_PROBED'
Assert-Contains $audit 'WINDOWS_AND_WSL_SHARE_CPU_GPU_RAM=YES'
Assert-Contains $audit 'SUBSCRIPTION_REQUIRED_BY_SCRIPT=NO'
Assert-Contains $audit 'WINDOWS_LOGICAL_PROCESSORS='

$check = (& $Script -Mode Check | Out-String)
Assert-Contains $check 'MODE=Check'
Assert-Contains $check 'RADIO_LOCAL_ADDRESS=http://127.0.0.1:8766/radio'
if (-not ($check.Contains('SPARKTIATES_CLUSTER=NOT_READY') -or
          $check.Contains('SPARKTIATES_CLUSTER=REACHABLE'))) {
  throw 'TEST_ECHOUE_DIAGNOSTIC_LOCAL'
}
$Checks++

$windowsModels = (& $Script -Mode WindowsModels | Out-String)
Assert-Contains $windowsModels 'MODE=WindowsModels'
Assert-Contains $windowsModels 'NATIVE_WINDOWS_AS_SEPARATE_CLUSTER_NODE=NOT_REGISTERED'
Assert-Contains $windowsModels 'INSTALLED_NATIVE_MODELS='
Assert-Contains $windowsModels 'COMPUTE_CREATED=0'

$source=Get-Content -LiteralPath $Script -Raw
Assert-NotContains $source 'Invoke-Expression'
Assert-NotContains $source 'Set-ExecutionPolicy'
Assert-NotContains $source 'New-NetFirewallRule'
Assert-NotContains $source 'netsh portproxy'
Assert-NotContains $source 'wsl --install'
Assert-Contains $source 'Invoke-WslLocal'
Assert-Contains $source 'LinuxSelfhost'
Assert-Contains $source 'ResearchInstall'
Assert-Contains $source 'WindowsResearchInstall'
Assert-Contains $source 'Get-CimInstance'
Write-Output ("SPARKTIATES_POWERSHELL_TESTS_PASS={0}" -f $Checks)
Write-Output 'NO_EXTERNAL_DOWNLOADS_DURING_TEST=PASS'
