#ifndef AppVersion
  #define AppVersion "3.0.0"
#endif

#ifndef AppOutputDir
  #define AppOutputDir "..\release"
#endif

#define ChineseSimplifiedMessagesFile AddBackslash(SourcePath) + "Languages\ChineseSimplified.isl"

[Setup]
AppId={{E2133B3E-AC9A-4D1F-9433-14D985A305EA}
AppName=南雍知课
AppVersion={#AppVersion}
AppPublisher=Eurus07e
AppPublisherURL=https://github.com/Eurus07e/nanyong-zhike-app
DefaultDirName={localappdata}\Programs\NanyongZhike
DefaultGroupName=南雍知课
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir={#AppOutputDir}
OutputBaseFilename=NanyongZhike-windows-x86_64-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=南雍知课
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "chinesesimp"; MessagesFile: "{#ChineseSimplifiedMessagesFile}"

[Tasks]
Name: "desktopicon"; Description: "创建桌面快捷方式"; GroupDescription: "快捷方式："; Flags: checkedonce

[Files]
Source: "..\dist\NanyongZhike\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\南雍知课"; Filename: "{app}\NanyongZhike.exe"
Name: "{autodesktop}\南雍知课"; Filename: "{app}\NanyongZhike.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\NanyongZhike.exe"; Description: "打开南雍知课"; Flags: nowait postinstall skipifsilent
