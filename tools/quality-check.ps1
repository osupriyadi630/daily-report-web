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
$fileBudgets = @(
  @{ Path = $app; Warn = 2000; Max = 6500 },
  @{ Path = $index; Warn = 1500; Max = 3000 },
  @{ Path = $styles; Warn = 2000; Max = 5000 }
)
foreach ($item in $fileBudgets) {
  $file = $item.Path
  $lineCount = (Get-Content -LiteralPath $file | Measure-Object -Line).Lines
  $name = Split-Path -Leaf $file
  $status = if ($lineCount -gt $item.Warn) { "PERLU DIPANTAU" } else { "OK" }
  Write-Host ("- {0}: {1} baris ({2})" -f $name, $lineCount, $status)
  if ($lineCount -gt $item.Max) {
    throw ("{0} melewati batas maksimum {1} baris. Pecah modul sebelum deploy." -f $name, $item.Max)
  }
}

Write-Host "Quality check selesai."



