Option Explicit
' Jin Agent + Jin Brain Router: detached, one-click Windows launcher.
' Keep this file at: Desktop\jin-agent\Launch-Jin.vbs
' Uses only built-in Windows Script Host and WinHTTP.
' Starts Router only if its local health endpoint is not already ready.
' IMPORTANT: On first setup, stop a Router previously started from PowerShell;
' otherwise this launcher will reuse that console-attached Router process.

Dim sh, fs, jinFolder, desktopFolder, routerFolder, pythonExe, jinExe
Dim i, launchError

Set sh = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")

jinFolder = fs.GetParentFolderName(WScript.ScriptFullName)
desktopFolder = fs.GetParentFolderName(jinFolder)
routerFolder = fs.BuildPath(desktopFolder, "jin-brain-router")
pythonExe = fs.BuildPath(routerFolder, ".venv\Scripts\python.exe")
jinExe = fs.BuildPath(jinFolder, "apps\desktop\release\win-unpacked\Jin.exe")

If Not fs.FileExists(jinExe) Then
    MsgBox "Jin.exe nahi mila:" & vbCrLf & jinExe & vbCrLf & vbCrLf & _
           "Launch-Jin.vbs ko Desktop\jin-agent folder mein rakhein.", _
           vbCritical, "Launch Jin - missing executable"
    WScript.Quit 1
End If

If Not RouterReady() Then
    If Not fs.FileExists(pythonExe) Then
        MsgBox "Router Python environment nahi mila:" & vbCrLf & pythonExe & vbCrLf & _
               "Pehle Router ki .venv / requirements install karein.", _
               vbCritical, "Launch Jin - missing Router Python"
        WScript.Quit 2
    End If

    ' Python starts hidden and independently of a PowerShell console.
    sh.CurrentDirectory = routerFolder
    On Error Resume Next
    Err.Clear
    sh.Run """" & pythonExe & """ -m backend.cli serve", 0, False
    launchError = Err.Description
    If Err.Number <> 0 Then
        Err.Clear
        On Error GoTo 0
        MsgBox "Router start nahi ho saka:" & vbCrLf & launchError, _
               vbCritical, "Launch Jin - Router start error"
        WScript.Quit 3
    End If
    On Error GoTo 0

    ' Allow local startup to complete; never open Jin before Router is ready.
    For i = 1 To 45
        WScript.Sleep 1000
        If RouterReady() Then Exit For
    Next
End If

If Not RouterReady() Then
    MsgBox "Jin Brain Router 45 seconds mein ready nahi hua." & vbCrLf & _
           "Check karein ke port 8787 free hai aur Router ko manually" & vbCrLf & _
           "PowerShell mein chala kar error dekhein:" & vbCrLf & _
           "cd " & Chr(34) & routerFolder & Chr(34) & vbCrLf & _
           ".\.venv\Scripts\python.exe -m backend.cli serve", _
           vbCritical, "Launch Jin - Router not ready"
    WScript.Quit 4
End If

' Router /health returned HTTP 200 with status=running. Now launch Jin.
sh.CurrentDirectory = fs.GetParentFolderName(jinExe)
On Error Resume Next
Err.Clear
sh.Run """" & fs.BuildPath(sh.SpecialFolders("Programs"), "JIN.lnk") & """", 1, False
launchError = Err.Description
If Err.Number <> 0 Then
    Err.Clear
    On Error GoTo 0
    MsgBox "Jin Desktop launch nahi hua:" & vbCrLf & launchError, _
           vbCritical, "Launch Jin - Jin start error"
    WScript.Quit 5
End If
On Error GoTo 0
WScript.Quit 0

Function RouterReady()
    Dim req
    RouterReady = False
    On Error Resume Next
    Err.Clear
    Set req = CreateObject("WinHttp.WinHttpRequest.5.1")
    If Err.Number = 0 Then
        req.SetProxy 1  ' Direct: bypass system proxy for localhost.
        req.SetTimeouts 1000, 1000, 1000, 1000
        req.Open "GET", "http://127.0.0.1:8787/health", False
        req.Send
        If Err.Number = 0 Then
            If req.Status = 200 Then
                If InStr(1, req.ResponseText, """running""", vbTextCompare) > 0 Then
                    RouterReady = True
                End If
            End If
        End If
    End If
    Err.Clear
    On Error GoTo 0
End Function
