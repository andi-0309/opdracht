#ifndef AppVersion
  #error AppVersion must be supplied by the release workflow
#endif
#define AppName "Opdracht"

[Setup]
AppId={{A09D93F2-80BC-467B-AB65-996655B077A9}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Opdracht
AppPublisherURL=https://github.com/andi-0309/opdracht
AppSupportURL=https://github.com/andi-0309/opdracht/issues
DefaultDirName={localappdata}\Programs\Opdracht
DefaultGroupName=Opdracht
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\..\dist
OutputBaseFilename=Opdracht-Windows-x64-Setup
SetupIconFile=..\native-icons\app_icon.ico
UninstallDisplayIcon={app}\opdracht.exe
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
WizardSizePercent=110
CloseApplications=yes
CloseApplicationsFilter=opdracht.exe
RestartApplications=no
VersionInfoDescription=Opdracht Installer
VersionInfoProductName=Opdracht

[Languages]
Name: "german"; MessagesFile: "compiler:Languages\German.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\build\native\build\windows\x64\runner\Release\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\build\MicrosoftEdgeWebview2Setup.exe"; Flags: dontcopy

[Icons]
Name: "{autoprograms}\Opdracht"; Filename: "{app}\opdracht.exe"
Name: "{autodesktop}\Opdracht"; Filename: "{app}\opdracht.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\opdracht.exe"; Description: "{cm:LaunchProgram,Opdracht}"; Flags: nowait postinstall skipifsilent

[Code]
function HasWebView2(): Boolean;
var
  Version: String;
  Key: String;
begin
  Key := 'Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}';
  Result := (RegQueryStringValue(HKCU, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'))
    or (RegQueryStringValue(HKLM32, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'))
    or (RegQueryStringValue(HKLM64, Key, 'pv', Version) and (Version <> '') and (Version <> '0.0.0.0'));
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  Code: Integer;
begin
  Result := '';
  if not HasWebView2() then
  begin
    ExtractTemporaryFile('MicrosoftEdgeWebview2Setup.exe');
    if not Exec(ExpandConstant('{tmp}\MicrosoftEdgeWebview2Setup.exe'),
      '/silent /install', '', SW_HIDE, ewWaitUntilTerminated, Code) then
      Result := 'Microsoft Edge WebView2 konnte nicht gestartet werden.'
    else if not HasWebView2() then
      Result := 'Microsoft Edge WebView2 konnte nicht installiert werden. Bitte die Internetverbindung prüfen und das Setup erneut starten.';
  end;
end;
