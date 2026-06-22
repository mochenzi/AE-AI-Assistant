import { spawn } from 'node:child_process';

const loadSecurity = "Add-Type -AssemblyName System.Security;";
const protectScript = `${loadSecurity}$v=[Console]::In.ReadToEnd();$b=[Text.Encoding]::UTF8.GetBytes($v);$p=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($p))`;
const unprotectScript = `${loadSecurity}$v=[Console]::In.ReadToEnd();$b=[Convert]::FromBase64String($v);$p=[Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($p))`;

export class DpapiVault {
  private run(script: string, input: string): Promise<string> {
    if (process.platform !== 'win32') return Promise.reject(new Error('DPAPI 仅支持 Windows'));
    return new Promise((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
      let output = '';
      let error = '';
      child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
      child.stderr.setEncoding('utf8').on('data', (chunk) => { error += chunk; });
      child.on('error', reject);
      child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(`DPAPI 操作失败：${error.trim()}`)));
      child.stdin.end(input, 'utf8');
    });
  }

  protect(secret: string): Promise<string> { return this.run(protectScript, secret); }
  unprotect(ciphertext: string): Promise<string> { return this.run(unprotectScript, ciphertext); }
}
