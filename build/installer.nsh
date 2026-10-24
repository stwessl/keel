; Uninstalling Keel also stops it sending settings to RawAccel at sign-in.
; Updates run the old uninstaller too, so they keep the sign-in script.
!macro customUnInstall
  ${ifNot} ${isUpdated}
    Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Keel RawAccel.vbs"
  ${endIf}
!macroend
