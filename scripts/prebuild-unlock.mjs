/**
 * Pre-build guard for Windows: terminates any lingering local node process
 * running `.next/standalone/server.js` that holds an OS directory lock on
 * `.next\standalone` so `next build` does not fail with `EBUSY`.
 * No-op on non-Windows platforms (e.g., Linux Docker / Cloud Build).
 */
import { execFileSync } from 'node:child_process';

async function unlockStandaloneDir() {
  if (process.platform !== 'win32') {
    process.exit(0);
  }

  try {
    const psScript = [
      'Get-CimInstance Win32_Process -Filter "Name = \'node.exe\'" |',
      'Where-Object { $_.CommandLine -like \'*.next/standalone/server.js*\' -or $_.CommandLine -like \'*.next\\standalone\\server.js*\' } |',
      'ForEach-Object {',
      '  Write-Output "Stopping lingering standalone server PID $($_.ProcessId)"',
      '  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue',
      '}',
    ].join(' ');

    // Pass Base64 UTF-16LE via -EncodedCommand so quoting cannot break across shells
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    ).trim();

    if (output) {
      console.log(`[prebuild-unlock] ${output}`);
      // Allow Windows to release directory handles on .next\standalone
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  } catch (err) {
    // Non-fatal: continue with next build even if CIM query fails
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[prebuild-unlock] Warning checking processes: ${msg}`);
  }
}

unlockStandaloneDir();
