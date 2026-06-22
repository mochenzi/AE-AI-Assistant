import { describe, expect, test } from 'vitest';
import { renderTemplate } from '../src/shared/templates';

describe('prompt templates', () => {
  test('fills declared variables', () => {
    expect(renderTemplate('创建 {{duration}} 秒的 {{title}}', { duration: '5', title: '片头' })).toBe('创建 5 秒的 片头');
  });

  test('rejects missing variables', () => {
    expect(() => renderTemplate('创建 {{title}}', {})).toThrow('title');
  });
});
