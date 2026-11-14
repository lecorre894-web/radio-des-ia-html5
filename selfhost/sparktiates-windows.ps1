#Requires -Version 5.1
<#
  SPARKTIATES | Compagnon Windows PowerShell, additif a WSL.
  Aucune ressource CPU/GPU/RAM n'est creee artificiellement.
  -Mode Audit : inventaire Windows sans reseau ni WSL.
  -Mode Check : diagnostic des deux services locaux.
  -Mode Start/Stop : pilote le cluster WSL existant, ne modifie pas la Radio publique.
  -Mode ResearchCheck/ResearchInstall/GptOssInstall : commande Ollama WSL.
  -Mode WindowsModels/WindowsResearchInstall : Ollama natif Windows, facultatif.
  -Mode Open : ouvre Radio locale sur Windows si le serveur repond.
#>
[CmdletBinding()]
param(
  [ValidateSet('Audit','Check','Start','Stop','Open','ResearchCheck',
               'ResearchInstall','GptOssInstall','WindowsModels','WindowsResearchInstall')]
  [string]$Mode = 'Audit'
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RadioAddress = 'http://127.0.0.1:8766/radio'
$ClusterStatusAddress = 'http://127.0.0.1:8766/api/v1/status'
$ResearchStatusAddress = 'http://127.0.0.1:8766/api/v1/research'
$WindowsOllamaAddress = 'http://127.0.0.1:11434/api/tags'

function Write-Report([string]$Key, [object]$Value) {
  $safe = [string]$Value
  Write-Output ("{0}={1}" -f $Key, $safe)
}

function Get-WindowsHardware {
  $info = [ordered]@{
    Origin = 'WINDOWS_OS'
    CpuName = 'UNAVAILABLE'
    LogicalProcessors = [Environment]::ProcessorCount
    PhysicalCores = 'NOT_MEASURED'
    RamTotalGiB = 'NOT_MEASURED'
    GpuNames = @()
    AdditionalPhysicalComputeCreated = 0
    WslSharesHostHardware = $true
  }
  if (Get-Command Get-CimInstance -ErrorAction SilentlyContinue) {
    try {
      $cpus = @(Get-CimInstance -ClassName Win32_Processor -ErrorAction Stop)
      if ($cpus.Count -gt 0) {
        $info.CpuName = [string]$cpus[0].Name
        $cores = 0
        foreach ($cpu in $cpus) { $cores += [int]$cpu.NumberOfCores }
        if ($cores -gt 0) { $info.PhysicalCores = $cores }
      }
    } catch {
      # Les donnees non verifiables restent NON MESUREES.
    }
    try {
      $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop
      if ($null -ne $os -and [double]$os.TotalVisibleMemorySize -gt 0) {
        $info.RamTotalGiB = [Math]::Round(
          ([double]$os.TotalVisibleMemorySize * 1024.0 / 1GB), 2
        )
      }
    } catch {}
    try {
      $cards = @(Get-CimInstance -ClassName Win32_VideoController -ErrorAction Stop)
      foreach ($card in $cards) {
        if ($card.Name) { $info.GpuNames += [string]$card.Name }
      }
    } catch {}
  }
  return $info
}

function Read-LocalEndpoint([string]$Uri) {
  if (-not $Uri.StartsWith('http://127.0.0.1:', [StringComparison]::Ordinal)) {
    throw 'Seuls les diagnostics sur 127.0.0.1 sont autorises.'
  }
  try {
    $data = Invoke-RestMethod -Uri $Uri -Method Get -TimeoutSec 5 -ErrorAction Stop
    return @{ Ready = $true; Data = $data; Error = '' }
  } catch {
    return @{ Ready = $false; Data = $null; Error = 'INACCESSIBLE_OR_PROTECTED' }
  }
}

function Invoke-WslLocal([string]$Script, [string[]]$Arguments = @()) {
  if ($Script -notin @('start_cluster_wsl.sh','stop_cluster_wsl.sh',
                        'setup_research_wsl.sh')) {
    throw 'Script WSL non autorise.'
  }
  if (-not (Get-Command 'wsl.exe' -ErrorAction SilentlyContinue)) {
    throw 'WSL_ABSENT : aucune commande lancee.'
  }
  $localScript = Join-Path $PSScriptRoot $Script
  if (-not (Test-Path -LiteralPath $localScript -PathType Leaf)) {
    throw ("SOURCE_LOCALE_ABSENTE : {0}" -f $Script)
  }
  # La conversion de chemin est effectuee par WSL : aucun chemin Windows invente.
  $linuxDir = (& wsl.exe --exec wslpath -a -u $PSScriptRoot | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $linuxDir.StartsWith('/')) {
    throw 'CONVERSION_CHEMIN_WSL=ECHEC'
  }
  # Aucun eval, aucun bash -lc avec chemin insere; arguments POSIX separes.
  $scriptArgs = @(
    '--exec', 'bash', '-c', 'cd -- "$1" && shift && exec bash "$@"',
    'sparktiates', $linuxDir, $Script
  ) + $Arguments
  & wsl.exe @scriptArgs
  if ($LASTEXITCODE -ne 0) {
    throw ("WSL_SCRIPT_ECHEC={0}; EXIT={1}" -f $Script, $LASTEXITCODE)
  }
}

function Get-NativeOllamaModels {
  $result = Read-LocalEndpoint $WindowsOllamaAddress
  if (-not $result.Ready) {
    Write-Report 'OLLAMA_WINDOWS' 'NOT_RUNNING_OR_UNREACHABLE'
    return @()
  }
  $list = @()
  foreach ($entry in @($result.Data.models)) {
    if ($null -ne $entry -and $null -ne $entry.name) {
      $list += [string]$entry.name
    }
  }
  Write-Report 'OLLAMA_WINDOWS' 'REACHABLE'
  return $list
}

Write-Report 'SPARKTIATES_WINDOWS_POWERSHELL' 'ADDITIVE_CONTROLLER'
Write-Report 'MODE' $Mode
Write-Report 'RADIO_PUBLIQUE' 'UNCHANGED'
Write-Report 'COMPUTE_CREATED' 0
Write-Report 'SUBSCRIPTION_REQUIRED_BY_SCRIPT' 'NO'
Write-Report 'WINDOWS_AND_WSL_SHARE_CPU_GPU_RAM' 'YES'

switch ($Mode) {
  'Audit' {
    $hardware = Get-WindowsHardware
    Write-Report 'WINDOWS_CPU' $hardware.CpuName
    Write-Report 'WINDOWS_LOGICAL_PROCESSORS' $hardware.LogicalProcessors
    Write-Report 'WINDOWS_PHYSICAL_CORES' $hardware.PhysicalCores
    Write-Report 'WINDOWS_RAM_GIB_OS' $hardware.RamTotalGiB
    Write-Report 'WINDOWS_GPUS_OS' ($hardware.GpuNames -join ' | ')
    Write-Report 'WSL_COMMAND_PRESENT' ([bool](Get-Command 'wsl.exe' -ErrorAction SilentlyContinue))
    Write-Report 'CLUSTER_REAL_CAPACITY' 'NOT_PROBED'
    Write-Report 'NETWORK_REQUESTS' 0
  }
  'Check' {
    $status = Read-LocalEndpoint $ClusterStatusAddress
    $research = Read-LocalEndpoint $ResearchStatusAddress
    Write-Report 'SPARKTIATES_CLUSTER' $(if ($status.Ready) { 'REACHABLE' } else { 'NOT_READY' })
    if ($status.Ready) {
      Write-Report 'REAL_ONLINE_NODES' $status.Data.online_nodes
      Write-Report 'REAL_USABLE_SLOTS' $status.Data.usable_slots
      Write-Report 'REAL_RUNNING_JOBS' $status.Data.running_jobs
    }
    if ($research.Ready) {
      Write-Report 'SCIENTIFIC_MODELS_DECLARED_INSTALLED' (@($research.Data.models_installed) -join ',')
      Write-Report 'DOCTORAL_METHOD_ROLES' @($research.Data.roles).Count
    } else {
      Write-Report 'SCIENTIFIC_MODELS' 'UNAVAILABLE'
    }
    Write-Report 'RADIO_LOCAL_ADDRESS' $RadioAddress
  }
  'Start' {
    Invoke-WslLocal 'start_cluster_wsl.sh'
    Write-Report 'RADIO_LOCAL_ADDRESS' $RadioAddress
    Write-Report 'START' 'ATTEMPTED_WITH_WSL'
  }
  'Stop' {
    Invoke-WslLocal 'stop_cluster_wsl.sh'
    Write-Report 'STOP' 'ATTEMPTED_WITH_WSL'
  }
  'Open' {
    $status = Read-LocalEndpoint $ClusterStatusAddress
    if (-not $status.Ready) {
      throw 'CLUSTER_OFFLINE : demarrer SPARKTIATES depuis WSL avant Open.'
    }
    Start-Process -FilePath $RadioAddress
    Write-Report 'RADIO_LOCAL_ADDRESS' $RadioAddress
  }
  'ResearchCheck' {
    Invoke-WslLocal 'setup_research_wsl.sh' @('--check')
  }
  'ResearchInstall' {
    Write-Report 'DOWNLOAD' 'EXPLICIT_QWEN3_14B_AND_DEEPSEEK_R1_14B_IN_WSL'
    Invoke-WslLocal 'setup_research_wsl.sh' @('--install')
  }
  'GptOssInstall' {
    Write-Report 'DOWNLOAD' 'EXPLICIT_GPT_OSS_20B_IN_WSL'
    Invoke-WslLocal 'setup_research_wsl.sh' @('--gpt-oss')
  }
  'WindowsModels' {
    $models = @(Get-NativeOllamaModels)
    Write-Report 'INSTALLED_NATIVE_MODELS' ($models -join ',')
    Write-Report 'NATIVE_WINDOWS_AS_SEPARATE_CLUSTER_NODE' 'NOT_REGISTERED'
  }
  'WindowsResearchInstall' {
    $executable = Get-Command 'ollama.exe' -ErrorAction SilentlyContinue
    if (-not $executable) { throw 'OLLAMA_WINDOWS_CLI_ABSENT : aucun telechargement.' }
    $result = Read-LocalEndpoint $WindowsOllamaAddress
    if (-not $result.Ready) { throw 'OLLAMA_WINDOWS_NOT_RUNNING : aucun telechargement.' }
    Write-Report 'DOWNLOAD' 'EXPLICIT_NATIVE_WINDOWS_QWEN3_14B_AND_DEEPSEEK_R1_14B'
    foreach ($model in @('qwen3:14b','deepseek-r1:14b')) {
      & $executable.Source pull $model
      if ($LASTEXITCODE -ne 0) {
        throw ("OLLAMA_WINDOWS_PULL_FAILED={0}" -f $model)
      }
      Write-Report 'PULLED_WINDOWS_MODEL' $model
    }
    Write-Report 'NATIVE_WINDOWS_AS_SEPARATE_CLUSTER_NODE' 'NOT_REGISTERED'
  }
}
