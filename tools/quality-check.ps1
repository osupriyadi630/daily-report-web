$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$app = Join-Path $root "web\app.js"
$index = Join-Path $root "web\index.html"
$styles = Join-Path $root "web\styles.css"

Write-Host "Memeriksa JavaScript..."
node --check $app

Write-Host "Memeriksa pola render berisiko..."
$appText = Get-Content -Raw -LiteralPath $app
if ($appText -match "\balert\s*\(") {
  throw "Masih ada alert(). Gunakan notify() agar UX konsisten."
}
if ($appText -match "\.on(click|change|input|submit)\s*=" -or $appText -match "\son(click|change|input|submit)\s*=") {
  throw "Ditemukan event handler inline/property assignment. Gunakan addEventListener/data-action."
}

Write-Host "Ringkasan ukuran file:"
$files = @($app, $index, $styles)
foreach ($file in $files) {
  $lineCount = (Get-Content -LiteralPath $file | Measure-Object -Line).Lines
  $name = Split-Path -Leaf $file
  $status = if ($lineCount -gt 2000) { "PERLU DIPANTAU" } else { "OK" }
  Write-Host ("- {0}: {1} baris ({2})" -f $name, $lineCount, $status)
}

Write-Host "Quality check selesai."


