# bootstrap.ps1 - Windows entry for WAFINE bootstrap
Param(
  [Parameter(ValueFromRemainingArguments=$true)]
  [string[]]$Args
)

function Fail-WithHint {
  param([string]$Message)
  Write-Error $Message
  exit 1
}

# Try WSL first
if (Get-Command wsl -ErrorAction SilentlyContinue) {
  Write-Host "Using WSL to run bootstrap.sh with: $($Args -join ' ')"
  $joined = $Args -join ' '
  # Repo clone inside WSL; override with WAFINE_WSL_REPO (absolute WSL path).
  $repo = if ($env:WAFINE_WSL_REPO) { $env:WAFINE_WSL_REPO } else { '$HOME/openwa-oci-infra' }
  wsl bash -c "cd $repo 2>/dev/null || { echo 'repo not found in WSL at $repo; set WAFINE_WSL_REPO'; exit 1; }; ./bootstrap.sh $joined"
  exit $LASTEXITCODE
}

# Try Git Bash
if (Get-Command bash -ErrorAction SilentlyContinue) {
  $bashPath = (Get-Command bash).Source
  if ($bashPath -match "Git") {
    Write-Host "Using Git Bash to run bootstrap.sh: $($Args -join ' ')"
    & bash "./bootstrap.sh" $Args
    exit $LASTEXITCODE
  }
}

Fail-WithHint "WSL or Git Bash not found. Install WSL (wsl --install) or Git for Windows, then re-run."
