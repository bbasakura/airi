param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath
)

$ErrorActionPreference = 'Stop'

$source = (Resolve-Path -LiteralPath $SourcePath).Path
if ([System.IO.Path]::GetExtension($source) -ine '.vrm') {
    throw 'The selected file must use the .vrm extension.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$destinationDirectory = Join-Path $repoRoot 'assets\local\frieren'
$destination = Join-Path $destinationDirectory 'model.vrm'

New-Item -ItemType Directory -Force -Path $destinationDirectory | Out-Null
Copy-Item -LiteralPath $source -Destination $destination -Force

$ignored = git -C $repoRoot check-ignore $destination
if (-not $ignored) {
    Remove-Item -LiteralPath $destination -Force
    throw 'Safety check failed: model.vrm is not ignored by Git.'
}

Write-Host "Installed local VRM model: $destination"
