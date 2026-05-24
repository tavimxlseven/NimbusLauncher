; -----------------------------------------------------------------------------
; Nimbus Launcher — Windows installer (NSIS)
;
; Per-user install (no admin required) into %LocalAppData%\Programs\NimbusLauncher.
; Registers nimbus:// deep-link handler so the website's "open launcher" button
; works after install. Adds Start Menu + Desktop shortcuts and a proper
; "Apps & Features" entry pointing at the bundled uninstaller.
; -----------------------------------------------------------------------------

Unicode true
SetCompressor /SOLID lzma

; ---- Branding -------------------------------------------------------------
!define APP_NAME       "Nimbus Launcher"
!define APP_PUBLISHER  "Nimbus"
!define APP_VERSION    "0.1.0"
!define APP_EXE        "Nimbus Launcher.exe"
!define APP_URL        "https://nimbusgg.me"
!define APP_REGKEY     "Software\NimbusLauncher"
!define UNINST_REGKEY  "Software\Microsoft\Windows\CurrentVersion\Uninstall\NimbusLauncher"
!define DEEP_LINK      "nimbus"

Name           "${APP_NAME}"
OutFile        "..\release\NimbusLauncher-Setup-${APP_VERSION}-x64.exe"
InstallDir     "$LOCALAPPDATA\Programs\NimbusLauncher"
InstallDirRegKey HKCU "${APP_REGKEY}" "InstallDir"
RequestExecutionLevel user
ShowInstDetails    show
ShowUninstDetails  show
BrandingText       "${APP_NAME} ${APP_VERSION}"

; Window appearance
!include "MUI2.nsh"
!include "FileFunc.nsh"
!define MUI_ICON   "..\build\icon.ico"
!define MUI_UNICON "..\build\icon.ico"

; Pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir ${APP_NAME}"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "PortugueseBR"

; ---------------------------------------------------------------------------
; Install
; ---------------------------------------------------------------------------
Section "Install"
  SetOutPath "$INSTDIR"

  ; Copy the entire packaged Electron tree (everything under win-unpacked).
  ; The /r flag recurses; /x excludes any nested .exe~ leftovers.
  File /r /x "*.exe~" "..\release\win-unpacked\*.*"

  ; ---------------------- Registry -----------------------------------------
  WriteRegStr HKCU "${APP_REGKEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${APP_REGKEY}" "Version"    "${APP_VERSION}"

  ; "Apps & Features" entry
  WriteRegStr HKCU "${UNINST_REGKEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr HKCU "${UNINST_REGKEY}" "DisplayVersion"  "${APP_VERSION}"
  WriteRegStr HKCU "${UNINST_REGKEY}" "Publisher"       "${APP_PUBLISHER}"
  WriteRegStr HKCU "${UNINST_REGKEY}" "URLInfoAbout"    "${APP_URL}"
  WriteRegStr HKCU "${UNINST_REGKEY}" "DisplayIcon"     '"$INSTDIR\${APP_EXE}"'
  WriteRegStr HKCU "${UNINST_REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${UNINST_REGKEY}" "UninstallString" '"$INSTDIR\Uninstall.exe"'
  WriteRegDWORD HKCU "${UNINST_REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINST_REGKEY}" "NoRepair" 1

  ; ---------------------- nimbus:// deep-link handler ----------------------
  ; The Electron main process handles auth deep links via the website
  ; (https://nimbusgg.me/auth/launcher → nimbus://auth?token=…).
  WriteRegStr HKCU "Software\Classes\${DEEP_LINK}" "" "URL:Nimbus Launcher Protocol"
  WriteRegStr HKCU "Software\Classes\${DEEP_LINK}" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\${DEEP_LINK}\DefaultIcon" "" '"$INSTDIR\${APP_EXE}",0'
  WriteRegStr HKCU "Software\Classes\${DEEP_LINK}\shell\open\command" "" '"$INSTDIR\${APP_EXE}" "%1"'

  ; ---------------------- Shortcuts ----------------------------------------
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortCut  "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortCut  "$SMPROGRAMS\${APP_NAME}\Desinstalar ${APP_NAME}.lnk" "$INSTDIR\Uninstall.exe"
  CreateShortCut  "$DESKTOP\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0

  ; ---------------------- Uninstaller --------------------------------------
  WriteUninstaller "$INSTDIR\Uninstall.exe"

  ; Estimate install size (in KB) for "Apps & Features"
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKCU "${UNINST_REGKEY}" "EstimatedSize" "$0"
SectionEnd

; ---------------------------------------------------------------------------
; Uninstall
; ---------------------------------------------------------------------------
Section "Uninstall"
  ; Stop running instance — best effort, no error if not running.
  ExecWait 'taskkill /F /IM "${APP_EXE}"'

  ; Remove app files
  RMDir /r "$INSTDIR"

  ; Remove shortcuts
  Delete "$DESKTOP\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Desinstalar ${APP_NAME}.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"

  ; Remove registry entries
  DeleteRegKey HKCU "${APP_REGKEY}"
  DeleteRegKey HKCU "${UNINST_REGKEY}"
  DeleteRegKey HKCU "Software\Classes\${DEEP_LINK}"
SectionEnd
