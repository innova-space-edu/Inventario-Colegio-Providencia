param(
  [Parameter(Mandatory = $false)]
  [string]$DatabasePath = ".\Colegio Providencia(1).accdb",

  [Parameter(Mandatory = $false)]
  [string]$OutputDirectory = ".\access-export"
)

$ErrorActionPreference = "Stop"

function Convert-DbValue {
  param([object]$Value)

  if ($null -eq $Value -or $Value -is [System.DBNull]) {
    return $null
  }

  if ($Value -is [byte[]]) {
    return [Convert]::ToBase64String($Value)
  }

  if ($Value -is [datetime]) {
    return $Value.ToString("o")
  }

  return $Value
}

function Get-SafeFileName {
  param([string]$Name)
  return ($Name -replace '[^A-Za-z0-9_-]', '_')
}

$resolvedDatabase = (Resolve-Path $DatabasePath).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

$providers = @("Microsoft.ACE.OLEDB.16.0", "Microsoft.ACE.OLEDB.12.0")
$connection = New-Object -ComObject ADODB.Connection
$connectedProvider = $null

foreach ($provider in $providers) {
  try {
    $connection.Open("Provider=$provider;Data Source=$resolvedDatabase;Persist Security Info=False;")
    $connectedProvider = $provider
    break
  }
  catch {
    if ($connection.State -ne 0) { $connection.Close() }
  }
}

if (-not $connectedProvider) {
  throw "No fue posible abrir Access. Instala Microsoft Access Database Engine (ACE) de 64 bits o ejecuta el script en un equipo con Microsoft Access instalado."
}

$manifestTables = @()
$schema = $connection.OpenSchema(20) # adSchemaTables

try {
  while (-not $schema.EOF) {
    $tableName = [string]$schema.Fields.Item("TABLE_NAME").Value
    $tableType = [string]$schema.Fields.Item("TABLE_TYPE").Value
    $schema.MoveNext()

    if ($tableType -ne "TABLE") { continue }
    if ($tableName -match '^MSys') { continue }
    if ($tableName -match '^f_[A-Fa-f0-9]+_') { continue }

    $safeName = Get-SafeFileName $tableName
    $outputFile = Join-Path $resolvedOutput "$safeName.json"
    $rows = @()
    $errorMessage = $null

    try {
      $escapedName = $tableName.Replace("]", "]]" )
      $recordset = $connection.Execute("SELECT * FROM [$escapedName]")

      try {
        while (-not $recordset.EOF) {
          $row = [ordered]@{}
          for ($i = 0; $i -lt $recordset.Fields.Count; $i++) {
            $field = $recordset.Fields.Item($i)
            $row[[string]$field.Name] = Convert-DbValue $field.Value
          }
          $rows += [pscustomobject]$row
          $recordset.MoveNext()
        }
      }
      finally {
        if ($recordset.State -ne 0) { $recordset.Close() }
      }

      @($rows) | ConvertTo-Json -Depth 12 | Set-Content -Path $outputFile -Encoding UTF8
      Write-Host ("Exportada {0}: {1} filas" -f $tableName, $rows.Count) -ForegroundColor Green
    }
    catch {
      $errorMessage = $_.Exception.Message
      Write-Warning ("No se pudo exportar {0}: {1}" -f $tableName, $errorMessage)
    }

    $manifestTables += [pscustomobject]@{
      name = $tableName
      file = if ($errorMessage) { $null } else { [System.IO.Path]::GetFileName($outputFile) }
      row_count = if ($errorMessage) { 0 } else { $rows.Count }
      error = $errorMessage
    }
  }
}
finally {
  if ($schema.State -ne 0) { $schema.Close() }
  if ($connection.State -ne 0) { $connection.Close() }
}

$hash = (Get-FileHash -Path $resolvedDatabase -Algorithm SHA256).Hash.ToLowerInvariant()
$manifest = [ordered]@{
  source_file = [System.IO.Path]::GetFileName($resolvedDatabase)
  source_path = $resolvedDatabase
  source_sha256 = $hash
  provider = $connectedProvider
  exported_at = (Get-Date).ToUniversalTime().ToString("o")
  tables = $manifestTables
}

$manifest | ConvertTo-Json -Depth 12 | Set-Content -Path (Join-Path $resolvedOutput "manifest.json") -Encoding UTF8
Write-Host "Exportación terminada: $resolvedOutput" -ForegroundColor Cyan
Write-Host "SHA-256: $hash" -ForegroundColor Cyan
