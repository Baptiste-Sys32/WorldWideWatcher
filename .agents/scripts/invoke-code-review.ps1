param (
    [Parameter(Mandatory=$true, HelpMessage="Base Git SHA")]
    [string]$BaseSha,

    [Parameter(Mandatory=$true, HelpMessage="Head Git SHA")]
    [string]$HeadSha,

    [Parameter(Mandatory=$false, HelpMessage="Path to ADR or Requirements File")]
    [string]$RequirementsFile = "",

    [Parameter(Mandatory=$false, HelpMessage="Brief description of the implemented changes")]
    [string]$Description = "Implemented recent changes as per requirements.",

    [Parameter(Mandatory=$false, HelpMessage="Model to use")]
    [string]$Model = "gemini-2.5-flash"
)

# Set strict error handling
$ErrorActionPreference = "Stop"

Write-Host "Gathering Code Review Context..." -ForegroundColor Cyan

# Ensure local-scripts directory exists
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkspaceRoot = Split-Path -Parent $ScriptDir
$TempPromptFile = Join-Path $ScriptDir "pr-review-prompt.txt"

# 1. Fetch Requirements text if provided
$RequirementsText = "No specific requirements provided."
if ($RequirementsFile -ne "") {
    if (Test-Path $RequirementsFile) {
        $RequirementsText = Get-Content $RequirementsFile -Raw
    } else {
        Write-Warning "Requirements file not found at $RequirementsFile"
    }
}

# 2. Extract git diff
Write-Host "Extracting diff between $BaseSha and $HeadSha..." -ForegroundColor DarkGray
try {
    $DiffOutput = git diff $BaseSha..$HeadSha
    if ([string]::IsNullOrWhiteSpace($DiffOutput)) {
        Write-Host "No changes found between $BaseSha and $HeadSha." -ForegroundColor Yellow
        exit 0
    }
} catch {
    Write-Error "Failed to execute git diff. Ensure you are in a git repository and the SHAs are valid."
    exit 1
}

# 3. Construct the Reviewer Prompt
$ReviewerPrompt = @"
You are a Senior Code Reviewer with expertise in software architecture, design patterns, and best practices. Your job is to review completed work against its plan or requirements and identify issues before they cascade. You are a sub-agent for Antigravity. Output ONLY the review format below. DO NOT use tools.

## What Was Implemented
$Description

## Requirements / Plan
$RequirementsText

## Git Range to Review
**Base:** $BaseSha
**Head:** $HeadSha

```diff
$DiffOutput
```

## What to Check
- **Plan alignment:** Does the implementation match the requirements? Are deviations justified?
- **Code quality:** Clean separation of concerns? Proper error handling?
- **Architecture:** Sound design decisions? Security concerns?
- **Testing:** Edge cases covered? Integration tests?
- **Production readiness:** Backward compatibility? Obvious bugs?

## Output Format
### Strengths
[What's well done? Be specific.]

### Issues
#### Critical (Must Fix)
[Bugs, security issues, data loss risks, broken functionality]
#### Important (Should Fix)
[Architecture problems, missing features, poor error handling, test gaps]
#### Minor (Nice to Have)
[Code style, optimization opportunities, documentation polish]

For each issue:
- File:line reference
- What's wrong
- Why it matters
- How to fix (if not obvious)

### Recommendations
[Improvements for code quality, architecture, or process]

### Assessment
**Ready to merge?** [Yes | No | With fixes]
**Reasoning:** [1-2 sentence technical assessment]
"@

# 4. Save to temporary file
$ReviewerPrompt | Set-Content $TempPromptFile -Encoding UTF8

# 5. Dispatch to Gemini CLI
Write-Host "Dispatching to Gemini CLI ($Model)..." -ForegroundColor Cyan
Write-Host "Depending on the diff size, this may take 30-60 seconds." -ForegroundColor DarkGray

$GeminiCmd = "$env:APPDATA\npm\gemini.cmd"
if (-Not (Test-Path $GeminiCmd)) {
    Write-Error "Gemini CLI not found at $GeminiCmd. Ensure it is installed globally via npm."
    exit 1
}

try {
    Get-Content $TempPromptFile -Raw | & $GeminiCmd -m $Model
    Write-Host "`nCode Review Complete." -ForegroundColor Green
} catch {
    Write-Error "Failed to execute Gemini CLI. If you received a 429 RESOURCE_EXHAUSTED error, try changing the model (e.g. -Model gemini-1.5-pro)."
} finally {
    # Clean up temp file
    if (Test-Path $TempPromptFile) {
        Remove-Item $TempPromptFile -Force
    }
}
