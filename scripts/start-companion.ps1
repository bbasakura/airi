$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$entrypoint = Join-Path $repoRoot 'packages\companion-core\src\server.mjs'
$envFile = Join-Path $repoRoot '.env'

$nodeArgs = @()
if (Test-Path -LiteralPath $envFile) {
    $nodeArgs += "--env-file=$envFile"
}
$nodeArgs += $entrypoint

& node @nodeArgs
