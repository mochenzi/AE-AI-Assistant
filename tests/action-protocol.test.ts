import { describe, expect, test } from 'vitest';
import { validateActionPlan, requiresDangerConfirmation } from '../src/shared/actionProtocol';

describe('ae-actions/v1', () => {
  test('accepts a valid create composition plan', () => {
    const result = validateActionPlan({
      version: 'ae-actions/v1',
      summary: '创建片头合成',
      risk: 'low',
      projectRevision: 'rev-1',
      actions: [{ type: 'comp.create', id: 'intro', name: '片头', width: 1920, height: 1080, duration: 5, frameRate: 25 }],
    });
    expect(result.ok).toBe(true);
  });

  test('rejects an unknown action type', () => {
    const result = validateActionPlan({
      version: 'ae-actions/v1', summary: '危险脚本', risk: 'high', projectRevision: 'rev-1',
      actions: [{ type: 'script.eval', code: 'app.project.close()' }],
    });
    expect(result.ok).toBe(false);
  });

  test('marks layer and keyframe deletion as dangerous', () => {
    expect(requiresDangerConfirmation([{ type: 'layer.delete', compId: 1, layerId: 2 }])).toBe(true);
    expect(requiresDangerConfirmation([{ type: 'keyframe.delete', compId: 1, layerId: 2, propertyPath: ['Transform', 'Opacity'], keyIndex: 1 }])).toBe(true);
  });
});
