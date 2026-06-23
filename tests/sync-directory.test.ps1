$ErrorActionPreference = 'Stop'

. (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\sync-directory.ps1')

function Assert-Throws {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Action,
    [Parameter(Mandatory = $true)][string]$MessagePattern
  )

  try {
    & $Action
  } catch {
    if ($_.Exception.Message -notmatch $MessagePattern) {
      throw "Expected error matching '$MessagePattern', got: $($_.Exception.Message)"
    }
    return
  }
  throw "Expected error matching '$MessagePattern', but no error was thrown."
}

$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempRoot = Join-Path $tempBase ("ae-ai-sync-test-" + [guid]::NewGuid().ToString('N'))
$reparsePaths = [Collections.Generic.List[string]]::new()

try {
  $source = Join-Path $tempRoot 'source'
  New-Item -ItemType Directory -Force -Path $source | Out-Null
  [IO.File]::WriteAllText((Join-Path $source 'current.txt'), 'current')

  $filesystemRoot = [IO.Path]::GetPathRoot($tempRoot)
  Assert-Throws -MessagePattern 'filesystem root' -Action {
    Sync-DirectoryMirror -Source $source -Target $filesystemRoot
  }

  Assert-Throws -MessagePattern 'must not overlap' -Action {
    Sync-DirectoryMirror -Source $source -Target (Join-Path $source 'nested-target')
  }

  $ancestorReal = Join-Path $tempRoot 'ancestor-real'
  $ancestorLink = Join-Path $tempRoot 'ancestor-link'
  New-Item -ItemType Directory -Force -Path $ancestorReal | Out-Null
  New-Item -ItemType Junction -Path $ancestorLink -Target $ancestorReal | Out-Null
  $reparsePaths.Add($ancestorLink)
  Assert-Throws -MessagePattern 'reparse point' -Action {
    Sync-DirectoryMirror -Source $source -Target (Join-Path $ancestorLink 'new-target')
  }

  $finalReal = Join-Path $tempRoot 'final-real'
  $finalLink = Join-Path $tempRoot 'final-link'
  New-Item -ItemType Directory -Force -Path $finalReal | Out-Null
  New-Item -ItemType Junction -Path $finalLink -Target $finalReal | Out-Null
  $reparsePaths.Add($finalLink)
  Assert-Throws -MessagePattern 'reparse point' -Action {
    Sync-DirectoryMirror -Source $source -Target $finalLink
  }

  Write-Host 'PASS: sync helper rejects unsafe destination paths.'
} finally {
  foreach ($reparsePath in $reparsePaths) {
    if (Test-Path -LiteralPath $reparsePath) {
      $item = Get-Item -LiteralPath $reparsePath -Force
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0) {
        throw "Refusing to clean unexpected non-reparse path: $reparsePath"
      }
      [IO.Directory]::Delete($reparsePath, $false)
    }
  }

  $resolvedTempRoot = [IO.Path]::GetFullPath($tempRoot)
  if (-not $resolvedTempRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to remove unexpected test path: $resolvedTempRoot"
  }
  if (Test-Path -LiteralPath $resolvedTempRoot) {
    Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
  }
}
