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
    throw "$Description terminó con código $LASTEXITCODE."
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$resolvedDatabase = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $DatabasePath))
$resolvedOutput = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDirectory))

if (-not (Test-Path $resolvedDatabase -PathType Leaf)) {
  throw "No se encontró la base Access: $resolvedDatabase"
}

Push-Location $repoRoot
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js 22 no está disponible en PATH. Instálalo antes de continuar."
  }
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "npm no está disponible en PATH. Instala Node.js 22 antes de continuar."
  }
  if (-not (Test-Path ".\package-lock.json" -PathType Leaf)) {
    throw "Falta package-lock.json. Actualiza el repositorio antes de ejecutar la migración."
  }

  if (-not $SkipInstall) {
    Write-Host "\n[1/4] Preparando dependencias reproducibles…" -ForegroundColor Cyan
    Invoke-Checked -Description "npm ci" -Command { & npm.cmd ci --no-audit --no-fund }
  }
  else {
    Write-Host "\n[1/4] Instalación de dependencias omitida por -SkipInstall." -ForegroundColor DarkYellow
  }

  Write-Host "\n[2/4] Exportando Microsoft Access…" -ForegroundColor Cyan
  & "$PSScriptRoot\export-access.ps1" -DatabasePath $resolvedDatabase -OutputDirectory $resolvedOutput
  if ($LASTEXITCODE -ne 0) {
    throw "La exportación de Access falló con código $LASTEXITCODE."
  }

  Write-Host "\n[3/4] Validando el export antes de tocar Supabase…" -ForegroundColor Cyan
  $reportPath = Join-Path $resolvedOutput "access-preflight-report.json"
  $reportJson = & node "$PSScriptRoot\validate-access-export.mjs" $resolvedOutput --json
  $validatorExit = $LASTEXITCODE
  $reportJson | Set-Content -Path $reportPath -Encoding UTF8

  if ($validatorExit -ne 0) {
    Write-Host "El preflight detectó errores estructurales. Informe: $reportPath" -ForegroundColor Red
    throw "No se realizará ninguna importación. Corrige primero el export de Access."
  }

  $report = Get-Content $reportPath -Raw | ConvertFrom-Json
  Write-Host ("Fuente: {0}" -f $report.source_file) -ForegroundColor Green
  Write-Host ("Filas exportadas: {0}" -f $report.totals.parsed_rows) -ForegroundColor Green
  Write-Host ("Tablas OK: {0}" -f $report.totals.tables_ok) -ForegroundColor Green
  Write-Host ("Códigos repetidos: {0}" -f $report.duplicate_inventory_codes.Count) -ForegroundColor Yellow
  Write-Host ("Series repetidas: {0}" -f $report.duplicate_serial_numbers.Count) -ForegroundColor Yellow
  Write-Host ("Tablas para revisión manual: {0}" -f $report.unmapped_tables.Count) -ForegroundColor Yellow
  Write-Host "Informe guardado en: $reportPath" -ForegroundColor Green

  if (-not $Import) {
    Write-Host "\n[4/4] VALIDACIÓN COMPLETADA. No se modificó Supabase." -ForegroundColor Green
    Write-Host "Cuando quieras cargar los datos, repite el comando agregando -Import." -ForegroundColor Cyan
    exit 0
  }

  if ([string]::IsNullOrWhiteSpace($env:SUPABASE_URL)) {
    throw "Falta la variable de entorno SUPABASE_URL."
  }
  if ([string]::IsNullOrWhiteSpace($env:SUPABASE_SECRET_KEY) -and [string]::IsNullOrWhiteSpace($env:SUPABASE_SERVICE_ROLE_KEY)) {
    throw "Falta SUPABASE_SECRET_KEY. Configúrala solo en la sesión local; no la escribas en Git ni en parámetros del comando."
  }

  Write-Host "\n[4/4] Importando a Supabase mediante transacciones atómicas…" -ForegroundColor Cyan
  Invoke-Checked -Description "Importación Access" -Command { & node "$PSScriptRoot\import-access.mjs" $resolvedOutput }

  Write-Host "\nMIGRACIÓN EJECUTADA." -ForegroundColor Green
  Write-Host "Revisa ahora /importaciones, /importaciones/revision y /calidad antes de darla por cerrada." -ForegroundColor Cyan
}
finally {
  Pop-Location
}
