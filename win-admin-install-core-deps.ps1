# Check if Chocolatey is installed
$chocoCheck = $null
try
{
    $chocoCheck = Get-Command choco -ErrorAction Stop
}
catch
{
    Write-Output "Error occurred while checking for Chocolatey."
}

if ($chocoCheck -eq $null)
{
    # Chocolatey not found, install it
    Write-Output "Chocolatey not found. Installing Chocolatey..."

    Set-ExecutionPolicy Bypass -Scope Process -Force;

    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072;

    iex ((New-Object System.Net.WebClient).DownloadString('https://chocolatey.org/install.ps1'))

    # Refresh environment variables
    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')

    Write-Output "Chocolatey installation completed."
}
else
{
    # Chocolatey found, print out the version
    Write-Output "Chocolatey is already installed."
    choco -v
}

#Write-Output "Installing Microsoft Visual C++ Runtime..."
#choco install vcredist140 -y

#Write-Output "Installing Microsoft Visual C++ Build Tools (2019)..."
#choco install visualstudio2019buildtools -y
#choco install visualstudio2019-workload-vctools -y

#Write-Output "Installation of visualstudio2019buildtools and vcredist140 completed."

# Check if pyenv is installed
try
{
    pyenv -v | Out-Null
    Write-Output "Pyenv is already installed."
}
catch
{
    Write-Output "Pyenv is not installed. Installing Pyenv..."

    # Download and execute the pyenv installation script
    Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/pyenv-win/pyenv-win/master/pyenv-win/install-pyenv-win.ps1" -OutFile "./install-pyenv-win.ps1"; &"./install-pyenv-win.ps1"
    if ($? -eq $true)
    {
        # Refresh environment variables
        $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
        Write-Output "Pyenv installation completed successfully."
    }
    else
    {
        Write-Output "Pyenv installation failed."
    }
}
