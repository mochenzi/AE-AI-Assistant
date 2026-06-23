$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempRoot = Join-Path $tempBase ("ae-ai-install-test-" + [guid]::NewGuid().ToString('N'))
$originalAppData = $env:APPDATA

try {
  $scripts = Join-Path $tempRoot 'scripts'
  $source = Join-Path $tempRoot 'dist'
  $appData = Join-Path $tempRoot 'appdata'
  $target = Join-Path $appData 'Adobe\CEP\extensions\com.chenyu.aeaiassistant'
  New-Item -ItemType Directory -Force -Path $scripts, (Join-Path $source 'assets'), (Join-Path $target 'assets') | Out-Null

  [IO.File]::WriteAllText((Join-Path $source 'index.html'), '<main>current</main>')
  [IO.File]::WriteAllText((Join-Path $source 'assets\current.js'), 'console.log("current")')
  [IO.File]::WriteAllText((Join-Path $target 'assets\stale.js'), 'console.log("stale")')

  Copy-Item -LiteralPath (Join-Path $repoRoot 'scripts\install-dev.ps1') -Destination $scripts
  $syncHelper = Join-Path $repoRoot 'scripts\sync-directory.ps1'
  if (Test-Path -LiteralPath $syncHelper) {
    Copy-Item -LiteralPath $syncHelper -Destination $scripts
  }

  $env:APPDATA = $appData
  $installerCommand = Get-Command (Join-Path $scripts 'install-dev.ps1')
  if (-not $installerCommand.Parameters.ContainsKey('SkipDebugMode')) {
    throw 'Installer must declare the SkipDebugMode test boundary.'
  }
  & $installerCommand -SkipDebugMode

  $sourceFiles = Get-ChildItem -LiteralPath $source -Recurse -File
  $targetFiles = Get-ChildItem -LiteralPath $target -Recurse -File
  $sourceRelative = @($sourceFiles | ForEach-Object { $_.FullName.Substring($source.Length).TrimStart('\') })
  $targetRelative = @($targetFiles | ForEach-Object { $_.FullName.Substring($target.Length).TrimStart('\') })
  $differences = @(Compare-Object $sourceRelative $targetRelative)
  if ($differences.Count -ne 0) {
    throw "Installed file set is not an exact mirror: $($differences | Out-String)"
  }

  foreach ($file in $sourceFiles) {
    $relativePath = $file.FullName.Substring($source.Length).TrimStart('\')
    $installedFile = Join-Path $target $relativePath
    $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash
    $targetHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installedFile).Hash
    if ($sourceHash -ne $targetHash) {
      throw "Installed file content differs: $relativePath"
    }
  }

  Write-Host 'PASS: installer creates an exact mirror of dist.'
} finally {
  $env:APPDATA = $originalAppData
  $resolvedTempRoot = [IO.Path]::GetFullPath($tempRoot)
  if (-not $resolvedTempRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected test path: $resolvedTempRoot"
  }
  if (Test-Path -LiteralPath $resolvedTempRoot) {
    Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
  }
}
