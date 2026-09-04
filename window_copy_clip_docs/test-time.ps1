$sw = [System.Diagnostics.Stopwatch]::StartNew()
cpf ".\cfclip.c"
$sw.Stop()
$sw.Elapsed.TotalMilliseconds