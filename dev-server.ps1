param(
  [int]$Port = 4173
)

$root = (Get-Location).Path
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse("127.0.0.1"), $Port)
$listener.Start()
Write-Host "Moje dni dev server: http://127.0.0.1:$Port/"

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".webmanifest" = "application/manifest+json; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg" = "image/svg+xml"
}

function Send-Response {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [byte[]]$Body,
    [string]$ContentType = "text/plain; charset=utf-8"
  )

  $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  if ($Body.Length -gt 0) {
    $Stream.Write($Body, 0, $Body.Length)
  }
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $buffer = New-Object byte[] 4096
      $read = $stream.Read($buffer, 0, $buffer.Length)
      if ($read -le 0) {
        continue
      }

      $request = [System.Text.Encoding]::ASCII.GetString($buffer, 0, $read)
      $firstLine = ($request -split "`r`n")[0]
      $parts = $firstLine -split " "
      if ($parts.Length -lt 2 -or $parts[0] -ne "GET") {
        Send-Response $stream 405 "Method Not Allowed" ([System.Text.Encoding]::UTF8.GetBytes("Method Not Allowed"))
        continue
      }

      $relativePath = [Uri]::UnescapeDataString($parts[1].Split("?")[0].TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($relativePath)) {
        $relativePath = "index.html"
      }

      $fullPath = [System.IO.Path]::GetFullPath((Join-Path $root $relativePath))
      if (-not $fullPath.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        Send-Response $stream 403 "Forbidden" ([System.Text.Encoding]::UTF8.GetBytes("Forbidden"))
        continue
      }

      if (-not [System.IO.File]::Exists($fullPath)) {
        Send-Response $stream 404 "Not Found" ([System.Text.Encoding]::UTF8.GetBytes("Not Found"))
        continue
      }

      $extension = [System.IO.Path]::GetExtension($fullPath).ToLowerInvariant()
      $contentType = "application/octet-stream"
      if ($mimeTypes.ContainsKey($extension)) {
        $contentType = $mimeTypes[$extension]
      }

      Send-Response $stream 200 "OK" ([System.IO.File]::ReadAllBytes($fullPath)) $contentType
    }
    finally {
      $client.Close()
    }
  }
}
finally {
  $listener.Stop()
}
