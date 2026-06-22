import { describe, expect, test } from 'vitest';
import { getProviderPreset, listProviderPresets } from '../src/shared/providers';

describe('provider presets', () => {
  test('includes every supported provider in display order', () => {
    expect(listProviderPresets().map(({ id }) => id)).toEqual([
      'openai', 'deepseek', 'moonshot', 'dashscope', 'zhipu', 'mimo', 'volcengine', 'custom',
    ]);
  });

  test('fills official compatible endpoints without hard-coded model ids', () => {
    expect(getProviderPreset('deepseek').baseUrl).toBe('https://api.deepseek.com/v1');
    expect(getProviderPreset('volcengine').models?.endpoint).toBeTruthy();
    expect(getProviderPreset('mimo').name).toContain('MiMo');
    for (const preset of listProviderPresets()) {
      expect(preset.chat?.model ?? '').toBe('');
      expect(preset.image?.model ?? '').toBe('');
      expect(preset.video?.model ?? '').toBe('');
    }
  });

  test('returns defensive copies so a form cannot mutate the preset catalog', () => {
    const first = getProviderPreset('openai');
    first.headers.Authorization = 'bad';
    first.capabilities.push('video');
    const second = getProviderPreset('openai');
    expect(second.headers).toEqual({});
    expect(second.capabilities).not.toContain('video');
  });

  test('does not advertise unverified media endpoints as ready to use', () => {
    for (const id of ['dashscope', 'zhipu', 'volcengine'] as const) {
      const preset = getProviderPreset(id);
      expect(preset.capabilities).toEqual(['chat']);
      expect(preset.image).toBeUndefined();
      expect(preset.video).toBeUndefined();
    }
  });
});
