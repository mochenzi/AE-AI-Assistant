import { describe, expect, test } from 'vitest';
import { normalizeCepFolderSelection, normalizeCepPath } from '../src/cep/bridge';

describe('CEP extension path', () => {
  test('normalizes Windows file URLs into drive paths', () => {
    expect(normalizeCepPath('file:///C:/Users/Test/Extension')).toBe('C:/Users/Test/Extension');
    expect(normalizeCepPath('C:/Users/Test/Extension')).toBe('C:/Users/Test/Extension');
  });

  test('leaves literal percent signs in ordinary Windows paths untouched', () => {
    expect(normalizeCepPath('D:/100%/archives')).toBe('D:/100%/archives');
  });

  test('returns a normalized selected folder and handles cancellation', () => {
    expect(normalizeCepFolderSelection({ err: 0, data: ['file:///D:/AI Archives'] })).toBe('D:/AI Archives');
    expect(normalizeCepFolderSelection({ err: 0, data: [] })).toBeNull();
    expect(normalizeCepFolderSelection({ err: 1, data: [] })).toBeNull();
  });
});
