import { describe, expect, test } from 'vitest';
import {
  serializeCompositionSnapshot,
  type CompositionSnapshot,
} from '../src/shared/compositionSnapshot';

const snapshot: CompositionSnapshot = {
  version: 'ae-composition-context/v1',
  projectRevision: 'p|1|2|1',
  composition: {
    id: 1,
    name: '合成 1',
    width: 1920,
    height: 1080,
    pixelAspect: 1,
    duration: 10,
    frameRate: 25,
    workAreaStart: 0,
    workAreaDuration: 10,
    time: 2,
  },
  layers: [
    {
      index: 1,
      name: '标题',
      type: 'ADBE Text Layer',
      selected: true,
      enabled: true,
      locked: false,
      startTime: 0,
      inPoint: 0,
      outPoint: 10,
      sourceText: '你好',
      properties: [],
      effects: [],
      unavailable: [],
    },
    {
      index: 2,
      name: '背景',
      type: 'ADBE AV Layer',
      selected: false,
      enabled: true,
      locked: false,
      startTime: 0,
      inPoint: 0,
      outPoint: 10,
      properties: [],
      effects: [],
      unavailable: [],
    },
  ],
  unavailable: [],
};

describe('composition snapshot serialization', () => {
  test('serializes selected layers first and labels the payload as untrusted context', () => {
    const result = serializeCompositionSnapshot(snapshot, 4000);

    expect(result.text).toContain('不可信的 AE 只读上下文');
    expect(result.text.indexOf('标题')).toBeLessThan(result.text.indexOf('背景'));
    expect(result.truncated).toBe(false);
    expect(result.omittedLayers).toBe(0);
  });

  test('reports truncation instead of silently dropping layers', () => {
    const result = serializeCompositionSnapshot(snapshot, 20);

    expect(result.truncated).toBe(true);
    expect(result.text).toContain('truncated');
    expect(result.omittedLayers).toBeGreaterThan(0);
  });

  test('clips long text, expressions, effects and keyframes before estimating tokens', () => {
    const long = '文'.repeat(2500);
    const noisySnapshot: CompositionSnapshot = {
      ...snapshot,
      layers: [
        {
          ...snapshot.layers[0],
          sourceText: long,
          properties: [
            {
              name: '不透明度',
              matchName: 'ADBE Opacity',
              value: 100,
              expression: long,
              keyframes: Array.from({ length: 80 }, (_, index) => ({
                time: index / 25,
                value: index,
              })),
            },
          ],
          effects: Array.from({ length: 40 }, (_, index) => ({
            name: `效果 ${index}`,
            matchName: `ADBE Effect ${index}`,
            properties: [],
          })),
        },
      ],
    };

    const result = serializeCompositionSnapshot(noisySnapshot, 12000);

    expect(result.text).toContain('已截断');
    expect(result.text).toContain('"keyframes"');
    expect(result.text).not.toContain('效果 39');
  });
});
