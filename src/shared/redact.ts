export function redactSecrets(value: string): string {
  return value
    .replace(/(authorization\s*:\s*(?:bearer\s+)?)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|token|secret)\s*[=:]\s*)[^\s&,;]+/gi, '$1[REDACTED]')
    .replace(/([?&](?:token|signature|sig|key)=)[^&\s]+/gi, '$1[REDACTED]')
    .replace(/\b((?:api[_-]?key|token|secret)[_-])[A-Za-z0-9+/=_-]{10,}/gi, '$1[REDACTED]')
    .replace(/\b[0-9a-f]{24,}\b/gi, '[REDACTED]')
    .replace(/\b(?=[A-Za-z0-9+/=_-]{24,}\b)(?=.*[A-Z])(?=.*[a-z])[A-Za-z0-9+/=_-]+\b/g, '[REDACTED]');
}
