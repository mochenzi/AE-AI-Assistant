function Assert-NoReparsePointComponent {
  param([Parameter(Mandatory = $true)][string]$Path)

  $root = [IO.Path]::GetPathRoot($Path)
  $current = $root
  $rootItem = Get-Item -LiteralPath $current -Force
  if (($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing destination path containing a reparse point: $current"
  }
  $components = $Path.Substring($root.Length).Split(@('\', '/'), [StringSplitOptions]::RemoveEmptyEntries)
  foreach ($component in $components) {
    $current = Join-Path $current $component
    if (-not (Test-Path -LiteralPath $current)) {
      break
    }
    $item = Get-Item -LiteralPath $current -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Refusing destination path containing a reparse point: $current"
    }
  }
}

function Sync-DirectoryMirror {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Target
  )

  $sourcePath = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $Source).Path).TrimEnd('\')
  $targetPath = [IO.Path]::GetFullPath($Target).TrimEnd('\')
  $targetRoot = [IO.Path]::GetPathRoot($targetPath).TrimEnd('\')
  if ($targetPath -eq $targetRoot) {
    throw "Refusing to replace filesystem root: $targetPath"
  }

  $sourcePrefix = $sourcePath + [IO.Path]::DirectorySeparatorChar
  $targetPrefix = $targetPath + [IO.Path]::DirectorySeparatorChar
  if ($sourcePath -eq $targetPath -or
      $sourcePrefix.StartsWith($targetPrefix, [StringComparison]::OrdinalIgnoreCase) -or
      $targetPrefix.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Source and target directories must not overlap: $sourcePath -> $targetPath"
  }

  Assert-NoReparsePointComponent -Path $targetPath

  if (Test-Path -LiteralPath $targetPath) {
    $resolvedTarget = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $targetPath).Path).TrimEnd('\')
    if ($resolvedTarget -ne $targetPath) {
      throw "Refusing to replace target that resolves elsewhere: $targetPath -> $resolvedTarget"
    }
    Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
  }

  New-Item -ItemType Directory -Force -Path $targetPath | Out-Null
  Get-ChildItem -LiteralPath $sourcePath -Force | Copy-Item -Destination $targetPath -Recurse -Force
}
