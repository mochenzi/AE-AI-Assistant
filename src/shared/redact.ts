export function redactSecrets(value: string): string {
  return value
    .replace(/(authorization\s*:\s*(?:bearer\s+)?)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|secret)\s*[=:]\s*)[^\s&,;]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:token|signature|sig|key)=)[^&\s]+/gi, '$1[REDACTED]');
}
