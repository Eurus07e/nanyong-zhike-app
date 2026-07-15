$ErrorActionPreference = "Stop"

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DesktopDirectory = $PSScriptRoot
$InstallerScript = Join-Path $DesktopDirectory "windows-installer.iss"
$Compiler = "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe"

if (-not (Test-Path -LiteralPath $Compiler -PathType Leaf)) {
    throw "Inno Setup is unavailable on this runner"
}

$LanguageFile = Join-Path $DesktopDirectory "Languages\ChineseSimplified.isl"
$ExpectedLanguageSha256 = "7d544b9bb1d142cfa11f2e5d3cc8abe2e55f8e066c5124e3772675aa236e1278"

if (-not (Test-Path -LiteralPath $LanguageFile -PathType Leaf)) {
    throw "The pinned Simplified Chinese language file is missing"
}

$ActualLanguageSha256 = (
    Get-FileHash -LiteralPath $LanguageFile -Algorithm SHA256
).Hash.ToLowerInvariant()
if ($ActualLanguageSha256 -cne $ExpectedLanguageSha256) {
    throw "Simplified Chinese language file checksum mismatch: $ActualLanguageSha256"
}

$PlaceholderDirectory = Join-Path $RepositoryRoot "dist\NanyongZhike"
$PlaceholderExecutable = Join-Path $RepositoryRoot "dist\NanyongZhike\NanyongZhike.exe"
$PreflightOutputDirectory = Join-Path $RepositoryRoot "release-preflight"
$SetupPath = Join-Path $PreflightOutputDirectory "NanyongZhike-windows-x86_64-setup.exe"

if (Test-Path -LiteralPath $PlaceholderDirectory) {
    throw "Windows installer preflight refuses to overwrite an existing distribution"
}
if (Test-Path -LiteralPath $PreflightOutputDirectory) {
    Remove-Item -LiteralPath $PreflightOutputDirectory -Recurse -Force
}

try {
    New-Item -ItemType Directory -Path $PlaceholderDirectory -Force | Out-Null
    [System.IO.File]::WriteAllBytes($PlaceholderExecutable, [byte[]](0))
    New-Item -ItemType Directory -Path $PreflightOutputDirectory -Force | Out-Null

    & $Compiler "/DAppOutputDir=..\release-preflight" $InstallerScript
    if ($LASTEXITCODE -ne 0) {
        throw "Windows installer preflight compilation failed"
    }
    if (-not (Test-Path -LiteralPath $SetupPath -PathType Leaf)) {
        throw "Windows installer preflight produced no setup executable"
    }
}
finally {
    Remove-Item -LiteralPath $PlaceholderDirectory -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $PreflightOutputDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
