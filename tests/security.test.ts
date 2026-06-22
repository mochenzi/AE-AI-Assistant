import { describe, expect, test } from 'vitest';
import { redactSecrets } from '../src/shared/redact';

describe('secret redaction', () => {
  test('redacts authorization, API keys and signed URLs', () => {
    const input = 'Authorization: Bearer sk-secret api_key=abc123 https://cdn.test/a.mp4?token=qwerty&x=1';
    const output = redactSecrets(input);
    expect(output).not.toContain('sk-secret');
    expect(output).not.toContain('abc123');
    expect(output).not.toContain('qwerty');
    expect(output).toContain('[REDACTED]');
  });
});
