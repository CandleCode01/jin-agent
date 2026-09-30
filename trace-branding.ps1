$ErrorActionPreference = "SilentlyContinue"

$Repo = (Get-Location).Path
$Report = Join-Path $Repo "branding-audit-jin-candlecode.txt"

# Jin / CandleCode / CandleCode — case insensitive
$Pattern = '(?i)jin|candlecode[\s._-]*research|(?<![a-z0-9])candlecode(?![a-z0-9])'

# Generated/vendor folders normally rebrand source audit ke liye useful nahi hote.
$ExcludedFolders = @(
    ".git",
    "node_modules",
    "dist",
    "build",
    "release",
    ".next",
    "coverage",
    "__pycache__",
    ".venv",
    "venv"
)

function Is-ExcludedPath {
    param([string]$Path)

    foreach ($folder in $ExcludedFolders) {
        if ($Path -match "(?i)[\\/]\Q$folder\E([\\/]|$)") {
            return $true
        }
    }

    return $false
}

function Is-BinaryFile {
    param([string]$Path)

    try {
        $stream = [System.IO.File]::OpenRead($Path)
        try {
            $length = [Math]::Min(4096, $stream.Length)
            $buffer = New-Object byte[] $length
            [void]$stream.Read($buffer, 0, $length)

            foreach ($byte in $buffer) {
                if ($byte -eq 0) {
                    return $true
                }
            }
        }
        finally {
            $stream.Dispose()
        }
    }
    catch {
        return $true
    }

    return $false
}

$allItems = Get-ChildItem -LiteralPath $Repo -Recurse -Force

$pathMatches = $allItems |
    Where-Object {
        $_.FullName -ne $Report -and
        -not (Is-ExcludedPath $_.FullName) -and
        $_.FullName -match $Pattern
    }

$files = $allItems |
    Where-Object {
        -not $_.PSIsContainer -and
        $_.FullName -ne $Report -and
        -not (Is-ExcludedPath $_.FullName)
    }

$contentMatches = foreach ($file in $files) {

    if (Is-BinaryFile $file.FullName) {
        continue
    }

    try {
        Select-String `
            -LiteralPath $file.FullName `
            -Pattern $Pattern `
            -AllMatches |
        ForEach-Object {

            [PSCustomObject]@{
                File = $_.Path.Replace($Repo + "\", "")
                Line = $_.LineNumber
                Text = $_.Line.Trim()
            }
        }
    }
    catch {}
}

$builder = New-Object System.Text.StringBuilder

[void]$builder.AppendLine("JIN BRANDING AUDIT")
[void]$builder.AppendLine("==================")
[void]$builder.AppendLine("Repo: $Repo")
[void]$builder.AppendLine("Generated: $(Get-Date)")
[void]$builder.AppendLine("Search: Jin / CandleCode / CandleCode")
[void]$builder.AppendLine("")

[void]$builder.AppendLine("==========================================")
[void]$builder.AppendLine("FILES / FOLDERS WITH NAME MATCHES")
[void]$builder.AppendLine("==========================================")

if ($pathMatches.Count -eq 0) {
    [void]$builder.AppendLine("NONE")
}
else {
    foreach ($item in $pathMatches) {
        [void]$builder.AppendLine(
            $item.FullName.Replace($Repo + "\", "")
        )
    }
}

[void]$builder.AppendLine("")
[void]$builder.AppendLine("==========================================")
[void]$builder.AppendLine("CONTENT MATCHES")
[void]$builder.AppendLine("==========================================")

if ($contentMatches.Count -eq 0) {
    [void]$builder.AppendLine("NONE")
}
else {
    foreach ($match in $contentMatches) {
        [void]$builder.AppendLine("")
        [void]$builder.AppendLine(
            "$($match.File):$($match.Line)"
        )
        [void]$builder.AppendLine(
            "    $($match.Text)"
        )
    }
}

[void]$builder.AppendLine("")
[void]$builder.AppendLine("==========================================")
[void]$builder.AppendLine("SUMMARY")
[void]$builder.AppendLine("==========================================")
[void]$builder.AppendLine("Path matches    : $($pathMatches.Count)")
[void]$builder.AppendLine("Content matches : $($contentMatches.Count)")

[System.IO.File]::WriteAllText(
    $Report,
    $builder.ToString(),
    [System.Text.Encoding]::UTF8
)

Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host " JIN BRANDING AUDIT COMPLETE" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "Path matches    : $($pathMatches.Count)"
Write-Host "Content matches : $($contentMatches.Count)"
Write-Host ""
Write-Host "Report:" -ForegroundColor Yellow
Write-Host $Report
Write-Host ""

$contentMatches |
    Select-Object File, Line, Text |
    Format-Table -AutoSize