param(
    [string]$RootPath
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$selectedRoot = if ([string]::IsNullOrWhiteSpace($RootPath)) {
    $repoRoot
}
else {
    [System.IO.Path]::GetFullPath($RootPath)
}

if (-not (Test-Path -LiteralPath (Join-Path $selectedRoot 'package.json'))) {
    throw "Erii root does not contain package.json: $selectedRoot"
}

$directories = @(
    (Join-Path $selectedRoot 'data'),
    (Join-Path $selectedRoot 'models'),
    (Join-Path $selectedRoot 'models\voicebox'),
    (Join-Path $selectedRoot 'cache'),
    (Join-Path $selectedRoot 'logs'),
    (Join-Path $selectedRoot 'config'),
    (Join-Path $selectedRoot 'config\local')
)

foreach ($directory in $directories) {
    New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

$directories | ForEach-Object {
    Get-Item -LiteralPath $_ | Select-Object FullName, LastWriteTime
}
