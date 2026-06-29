import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const source = readFileSync('public/jsx/host.jsx', 'utf8');

function functionBody(name: string): string {
  const start = source.indexOf(`AEAI.${name} = function`);
  if (start < 0) return '';
  const next = source.indexOf('\n  AEAI.', start + 1);
  return next < 0 ? source.slice(start) : source.slice(start, next);
}

describe('host active composition snapshot source contract', () => {
  test('defines the read-only active composition snapshot collector and helpers', () => {
    expect(source).toContain('AEAI.getActiveCompositionSnapshot');
    expect(source).toContain('function safeValue');
    expect(source).toContain('function readProperty');
    expect(source).toContain('unavailable');
    expect(source).toContain('selected');
    expect(source).toContain('parentIndex');
    expect(source).toContain('sourceText');
    expect(source).toContain('effects');
    expect(source).toContain('keyframes');
  });

  test('does not mutate AE state or touch files/network inside snapshot collector', () => {
    const body = functionBody('getActiveCompositionSnapshot');

    expect(body).not.toContain('beginUndoGroup');
    expect(body).not.toContain('setValue');
    expect(body).not.toContain('remove(');
    expect(body).not.toContain('new File');
    expect(body).not.toContain('importFile');
    expect(body).not.toContain('Socket');
  });
});
