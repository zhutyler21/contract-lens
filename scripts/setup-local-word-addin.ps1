[CmdletBinding()]
param(
  [string]$ManifestPath,
  [string]$RegistryValueName = "WordContractReviewer",
  [string]$PemPath,
  [string]$OfficeVersion = "16.0",
  [switch]$SkipCertificate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if (-not $ManifestPath) {
  $ManifestPath = Join-Path $repoRoot "manifest.xml"
}

if (-not $PemPath) {
  $PemPath = Join-Path $repoRoot "node_modules\.vite\basic-ssl\_cert.pem"
}

function Resolve-ExistingPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PathValue,
    [Parameter(Mandatory = $true)]
    [string]$DisplayName
  )

  $resolved = Resolve-Path -LiteralPath $PathValue -ErrorAction SilentlyContinue
  if (-not $resolved) {
    throw "$DisplayName does not exist: $PathValue"
  }

  return $resolved.Path
}

function Get-CertificatePemBlock {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PemFilePath
  )

  $lines = Get-Content -LiteralPath $PemFilePath
  $startIndex = -1
  $endIndex = -1

  for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq "-----BEGIN CERTIFICATE-----") {
      $startIndex = $i
      break
    }
  }

  if ($startIndex -lt 0) {
    throw "No certificate block found in PEM: $PemFilePath"
  }

  for ($i = $startIndex; $i -lt $lines.Count; $i++) {
    if ($lines[$i].Trim() -eq "-----END CERTIFICATE-----") {
      $endIndex = $i
      break
    }
  }

  if ($endIndex -lt 0) {
    throw "Certificate block is incomplete in PEM: $PemFilePath"
  }

  return ($lines[$startIndex..$endIndex] -join [Environment]::NewLine)
}

function Test-CertificateTrusted {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Thumbprint
  )

  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "CurrentUser")
  try {
    $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
    $found = $store.Certificates.Find(
      [System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
      $Thumbprint,
      $false
    )
    return $found.Count -gt 0
  }
  finally {
    $store.Close()
  }
}

function Import-CertificateToCurrentUserRoot {
  param(
    [Parameter(Mandatory = $true)]
    [string]$CertFilePath
  )

  try {
    Import-Certificate -FilePath $CertFilePath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
    return
  }
  catch {
    $certutil = Get-Command certutil.exe -ErrorAction SilentlyContinue
    if (-not $certutil) {
      throw "Import-Certificate failed and certutil.exe is unavailable. Error: $($_.Exception.Message)"
    }
  }

  & certutil.exe -user -addstore Root $CertFilePath | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "certutil failed with exit code $LASTEXITCODE"
  }
}

$manifestFullPath = Resolve-ExistingPath -PathValue $ManifestPath -DisplayName "Manifest file"
$developerKey = "HKCU:\Software\Microsoft\Office\$OfficeVersion\WEF\Developer"

New-Item -Path $developerKey -Force | Out-Null
New-ItemProperty -Path $developerKey -Name $RegistryValueName -Value $manifestFullPath -PropertyType String -Force | Out-Null

Write-Output "[OK] Registry entry created."
Write-Output "     Key   : $developerKey"
Write-Output "     Name  : $RegistryValueName"
Write-Output "     Value : $manifestFullPath"

if (-not $SkipCertificate) {
  $pemFullPath = Resolve-ExistingPath -PathValue $PemPath -DisplayName "PEM certificate file"
  $certificateBlock = Get-CertificatePemBlock -PemFilePath $pemFullPath

  $tempCerPath = Join-Path ([System.IO.Path]::GetTempPath()) ("word-addin-localhost-" + [Guid]::NewGuid().ToString("N") + ".cer")

  try {
    Set-Content -LiteralPath $tempCerPath -Value $certificateBlock -Encoding Ascii
    $certificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($tempCerPath)
    $thumbprint = $certificate.Thumbprint.ToUpperInvariant()

    if (Test-CertificateTrusted -Thumbprint $thumbprint) {
      Write-Output "[OK] Certificate already trusted in CurrentUser\\Root."
    }
    else {
      Import-CertificateToCurrentUserRoot -CertFilePath $tempCerPath
      if (-not (Test-CertificateTrusted -Thumbprint $thumbprint)) {
        throw "Certificate import finished but the certificate is still not trusted."
      }
      Write-Output "[OK] Certificate imported into CurrentUser\\Root."
    }

    Write-Output "     Subject    : $($certificate.Subject)"
    Write-Output "     Thumbprint : $thumbprint"
    Write-Output "     Expires    : $($certificate.NotAfter)"
  }
  finally {
    Remove-Item -LiteralPath $tempCerPath -ErrorAction SilentlyContinue
  }
}
else {
  Write-Output "[SKIP] Certificate import skipped by -SkipCertificate."
}

Write-Output ""
Write-Output "Next steps:"
Write-Output "1) Start dev server: npm run dev"
Write-Output "2) Fully close Word (no WINWORD.EXE), then reopen Word"
Write-Output "3) Open any document and use the '合同审核' ribbon group"
