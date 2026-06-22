$process = Start-Process -NoNewWindow -PassThru -FilePath "node" -ArgumentList "server.js" -WindowStyle Hidden -RedirectStandardOutput "server.log" -RedirectStandardError "server.err"
Start-Sleep -Seconds 5
if (Test-Path "server.log") { Get-Content "server.log" }
if (Test-Path "server.err") { Get-Content "server.err" }
Write-Host "Server PID: $($process.Id)"
