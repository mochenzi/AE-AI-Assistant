import { describe, expect, test } from 'vitest';
import { normalizeCepPath } from '../src/cep/bridge';

describe('CEP extension path', () => {
  test('normalizes Windows file URLs into drive paths', () => {
    expect(normalizeCepPath('file:///C:/Users/Test/Extension')).toBe('C:/Users/Test/Extension');
    expect(normalizeCepPath('C:/Users/Test/Extension')).toBe('C:/Users/Test/Extension');
  });
});
