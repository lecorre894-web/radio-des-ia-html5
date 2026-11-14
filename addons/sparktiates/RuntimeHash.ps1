# Test déterministe PowerShell 7+ : SHA-256 du texte UTF-8 reçu sur stdin.
$ErrorActionPreference = 'Stop'
$text = [Console]::In.ReadToEnd()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
    $digest = $sha.ComputeHash($bytes)
    [Console]::Out.WriteLine(([BitConverter]::ToString($digest)).Replace('-', '').ToLowerInvariant())
} finally {
    $sha.Dispose()
}
