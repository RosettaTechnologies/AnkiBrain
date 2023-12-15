# set working dir to project root
Set-Location -Path $PSScriptRoot

# install Python 3.9.13 via pyenv
pyenv install 3.9.13
pyenv local 3.9.13
$pythonPath = & pyenv which python3.9

$venv_dir = ".\\user_files\\venv"
if (Test-Path $venv_dir)
{
    Write-Host "venv exists, deleting..."
    Remove-Item -Path $venv_dir -Recurse -Force
}


# create a new virtual environment using Python 3.9.13
Write-Host "Creating new python virtualenv in ./user_files/venv"
& $pythonPath -m venv ./user_files/venv


# activate the virtual environment
.\user_files\venv\Scripts\activate

# install packages
pip install -r windows_requirements.txt