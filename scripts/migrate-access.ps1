param(
  [Parameter(Mandatory = $false)]
  [string]$DatabasePath = ".\Colegio Providencia(1).accdb",

  [Parameter(Mandatory = $false)]
  [string]$OutputDirectory = ".\access-export",

  [Parameter(Mandatory = $false)]
  [switch]$Import,

  [Parameter(Mandatory = $false)]
  [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Command,
    [Parameter(Mandatory = $true)]
    [string]$Description
  )

  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw ("{0} termino con codigo {1}." -f $Description, $LASTEXITCODE)
  }
}

function Resolve-AbsolutePath {
  param([Parameter(Mandatory = $true)][string]$Value)

  if ([System.IO.Path]::IsPathRooted($Value)) {
    return [System.IO.Path]::GetFullPath($Value)
  }

  return [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $Value))
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedDatabase = Resolve-AbsolutePath $DatabasePath
$resolvedOutput = Resolve-AbsolutePath $OutputDirectory

if (-not (Test-Path $resolvedDatabase -PathType Leaf)) {
  throw ("No se encontro la base Access: {0}" -f $resolvedDatabase)
}

Set-Location $repoRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js 22 no esta disponible en PATH. Instalalo antes de continuar."
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
  throw "npm no esta disponible en PATH. Instala Node.js 22 antes de continuar."
}

if (-not (Test-Path ".\package-lock.json" -PathType Leaf)) {
  throw "Falta package-lock.json. Ejecuta git pull antes de continuar."
}

if (-not $SkipInstall) {
  Write-Host ""
  Write-Host "[1/4] Preparando dependencias reproducibles..." -ForegroundColor Cyan
  Invoke-Checked -Description "npm ci" -Command { & npm.cmd ci --no-audit --no-fund }
}
else {
  Write-Host ""
  Write-Host "[1/4] Instalacion de dependencias omitida por -SkipInstall." -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "[2/4] Exportando Microsoft Access..." -ForegroundColor Cyan
& "$PSScriptRoot\export-access.ps1" -DatabasePath $resolvedDatabase -OutputDirectory $resolvedOutput

if ($LASTEXITCODE -ne 0) {
  throw ("El exportador de Access termino con codigo {0}." -f $LASTEXITCODE)
}

Write-Host ""
Write-Host "[3/4] Validando el export antes de tocar Supabase..." -ForegroundColor Cyan
$reportPath = Join-Path $resolvedOutput "access-preflight-report.json"
$reportJson = & node "$PSScriptRoot\validate-access-export.mjs" $resolvedOutput --json
$validatorExit = $LASTEXITCODE
$reportJson | Set-Content -Path $reportPath -Encoding UTF8

if ($validatorExit -ne 0) {
  Write-Host ("El preflight detecto errores estructurales. Informe: {0}" -f $reportPath) -ForegroundColor Red
  throw "No se realizara ninguna importacion. Corrige primero el export de Access."
}

$report = Get-Content $reportPath -Raw | ConvertFrom-Json
Write-Host ("Fuente: {0}" -f $report.source_file) -ForegroundColor Green
Write-Host ("Filas exportadas: {0}" -f $report.totals.parsed_rows) -ForegroundColor Green
Write-Host ("Tablas OK: {0}" -f $report.totals.tables_ok) -ForegroundColor Green
Write-Host ("Codigos repetidos: {0}" -f $report.duplicate_inventory_codes.Count) -ForegroundColor Yellow
Write-Host ("Series repetidas: {0}" -f $report.duplicate_serial_numbers.Count) -ForegroundColor Yellow
Write-Host ("Tablas para revision manual: {0}" -f $report.unmapped_tables.Count) -ForegroundColor Yellow
Write-Host ("Informe guardado en: {0}" -f $reportPath) -ForegroundColor Green

if (-not $Import) {
  Write-Host ""
  Write-Host "[4/4] VALIDACION COMPLETADA. No se modifico Supabase." -ForegroundColor Green
  Write-Host "Cuando quieras cargar los datos, repite el comando agregando -Import." -ForegroundColor Cyan
  exit 0
}

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_URL)) {
  throw "Falta la variable de entorno SUPABASE_URL."
}

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_SECRET_KEY) -and [string]::IsNullOrWhiteSpace($env:SUPABASE_SERVICE_ROLE_KEY)) {
  throw "Falta SUPABASE_SECRET_KEY. Configurala solo en la sesion local; no la escribas en Git ni en parametros del comando."
}

Write-Host ""
Write-Host "[4/4] Importando a Supabase mediante transacciones atomicas..." -ForegroundColor Cyan
Invoke-Checked -Description "Importacion Access" -Command { & node "$PSScriptRoot\import-access.mjs" $resolvedOutput }

Write-Host ""
Write-Host "MIGRACION EJECUTADA." -ForegroundColor Green
Write-Host "Revisa ahora /importaciones, /importaciones/revision y /calidad antes de darla por cerrada." -ForegroundColor Cyan
