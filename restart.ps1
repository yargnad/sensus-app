# Sensus Project Restart Script

Write-Host "Attempting to stop processes on ports 3000 and 5000..."

# Find and stop the process using port 3000
try {
    $clientConnection = Get-NetTCPConnection -LocalPort 3000 -ErrorAction Stop
    if ($clientConnection) {
        $clientProcessId = $clientConnection.OwningProcess | Select-Object -First 1
        Stop-Process -Id $clientProcessId -Force
        Write-Host "Successfully stopped client process (PID: $clientProcessId) on port 3000."
    }
} catch {
    Write-Host "No process found running on port 3000."
}

# Find and stop the process using port 5000
try {
    $serverConnection = Get-NetTCPConnection -LocalPort 5000 -ErrorAction Stop
    if ($serverConnection) {
        $serverProcessId = $serverConnection.OwningProcess | Select-Object -First 1
        Stop-Process -Id $serverProcessId -Force
        Write-Host "Successfully stopped server process (PID: $serverProcessId) on port 5000."
    }
} catch {
    Write-Host "No process found running on port 5000."
}


Write-Host "`nStarting Sensus client and server..."

# Start the server in a new window
Start-Process pwsh -ArgumentList "-Command", "cd d:\Users\yargnad\Documents\Projects\Sensus\server; npm start" -PassThru

# Start the client in a new window
Start-Process pwsh -ArgumentList "-Command", "cd d:\Users\yargnad\Documents\Projects\Sensus\client; npm start" -PassThru

Write-Host "`nRestart process complete. New terminal windows have been opened for the client and server."
