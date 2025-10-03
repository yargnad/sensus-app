# Start the server in development mode (sets NODE_ENV for this process)
Write-Host "Starting server in development mode..."
$env:NODE_ENV = 'development'
Set-Location -Path (Split-Path -Path $MyInvocation.MyCommand.Definition -Parent)
npm start
