param([switch]$Build, [switch]$SkipDebugMode)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if ($Build) { Push-Location $root; try { npm run build } finally { Pop-Location } }
$source = Join-Path $root 'dist'
if (-not (Test-Path $source)) { throw '请先运行 npm run build，或使用 .\scripts\install-dev.ps1 -Build' }
$target = Join-Path $env:APPDATA 'Adobe\CEP\extensions\com.chenyu.aeaiassistant'
. (Join-Path $PSScriptRoot 'sync-directory.ps1')
Sync-DirectoryMirror -Source $source -Target $target
if (-not $SkipDebugMode) {
  9..12 | ForEach-Object { $key = "HKCU:\Software\Adobe\CSXS.$_"; New-Item -Force $key | Out-Null; New-ItemProperty -Path $key -Name PlayerDebugMode -Value '1' -PropertyType String -Force | Out-Null }
}
Write-Host "已安装到 $target。请重启 AE，然后打开：窗口 > 扩展 > AE AI Assistant"
