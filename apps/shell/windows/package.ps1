$ErrorActionPreference = 'Stop'
$release = Join-Path $PSScriptRoot '..\build\native\build\windows\x64\runner\Release'
$programFiles = [Environment]::GetFolderPath('ProgramFilesX86')
$vswhere = Join-Path $programFiles 'Microsoft Visual Studio\Installer\vswhere.exe'
$visualStudio = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$visualStudio) { throw 'Visual C++ build tools not found' }
$runtime = Get-ChildItem "$visualStudio\VC\Redist\MSVC" -Directory |
    Sort-Object Name -Descending |
    ForEach-Object { Join-Path $_.FullName 'x64\Microsoft.VC143.CRT' } |
    Where-Object { Test-Path $_ } |
    Select-Object -First 1
if (!$runtime) { throw 'Visual C++ runtime redistributables not found' }
Copy-Item "$runtime\*.dll" $release
foreach ($dll in @('msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll')) {
    if (!(Test-Path (Join-Path $release $dll))) { throw "Missing runtime: $dll" }
}
$bootstrap = Join-Path $PSScriptRoot '..\build\MicrosoftEdgeWebview2Setup.exe'
Invoke-WebRequest 'https://go.microsoft.com/fwlink/p/?LinkId=2124703' -OutFile $bootstrap
$signature = Get-AuthenticodeSignature $bootstrap
if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') {
    throw 'WebView2 bootstrapper signature could not be verified'
}
$compiler = Join-Path $programFiles 'Inno Setup 6\ISCC.exe'
if (!(Test-Path $compiler)) { throw 'Inno Setup 6 is required on the Windows build runner' }
& $compiler "/DAppVersion=$env:APP_VERSION" (Join-Path $PSScriptRoot 'installer.iss')
if ($LASTEXITCODE -ne 0) { throw 'Installer compilation failed' }
New-Item -ItemType Directory -Force dist | Out-Null
Compress-Archive -Path "$release\*" -DestinationPath dist/Opdracht-Windows-x64.zip

# Exercise setup, in-place update and uninstall without touching the WebView profile.
$setup = (Resolve-Path 'dist/Opdracht-Windows-x64-Setup.exe').Path
$install = Join-Path $env:RUNNER_TEMP 'Opdracht-install-check'
$profile = Join-Path $env:LOCALAPPDATA 'Opdracht\WebView2'
New-Item -ItemType Directory -Force $profile | Out-Null
$sentinel = Join-Path $profile 'installer-preservation-test'
Set-Content $sentinel 'preserve-profile'
for ($i = 0; $i -lt 2; $i++) {
    $process = Start-Process $setup -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART', "/DIR=$install", "/LOG=$env:RUNNER_TEMP\opdracht-install-$i.log") -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
    foreach ($file in @('opdracht.exe', 'flutter_windows.dll', 'vcruntime140.dll', 'data\icudtl.dat')) {
        if (!(Test-Path (Join-Path $install $file))) { throw "Installation is missing $file" }
    }
}
$process = Start-Process (Join-Path $install 'unins000.exe') -ArgumentList @('/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART') -Wait -PassThru
if ($process.ExitCode -ne 0 -or (Test-Path (Join-Path $install 'opdracht.exe'))) { throw 'Uninstall failed' }
if (!(Test-Path $sentinel)) { throw 'Setup or uninstall removed the WebView profile' }
Remove-Item $sentinel
Write-Output 'Installer: fresh install, upgrade, uninstall and profile preservation verified.'
