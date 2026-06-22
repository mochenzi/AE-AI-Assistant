import Ajv from 'ajv';

export interface AeActionPlan {
  version: 'ae-actions/v1';
  summary: string;
  risk: 'low' | 'medium' | 'high';
  projectRevision: string;
  actions: AeAction[];
}

export type AeAction =
  | { type: 'project.context' }
  | { type: 'comp.create'; id: string; name: string; width: number; height: number; duration: number; frameRate: number }
  | { type: 'layer.text.create'; compId: number | string; name: string; text: string }
  | { type: 'layer.shape.create'; compId: number | string; name: string }
  | { type: 'layer.solid.create'; compId: number | string; name: string; color: [number, number, number]; width: number; height: number; duration: number }
  | { type: 'property.set'; compId: number | string; layerId: number; propertyPath: string[]; value: unknown }
  | { type: 'keyframe.set'; compId: number | string; layerId: number; propertyPath: string[]; time: number; value: unknown }
  | { type: 'keyframe.delete'; compId: number | string; layerId: number; propertyPath: string[]; keyIndex: number }
  | { type: 'expression.set'; compId: number | string; layerId: number; propertyPath: string[]; expression: string }
  | { type: 'effect.add'; compId: number | string; layerId: number; matchName: string }
  | { type: 'effect.parameter.set'; compId: number | string; layerId: number; effectMatchName: string; parameterMatchName: string; value: unknown }
  | { type: 'footage.import'; path: string }
  | { type: 'layer.delete'; compId: number | string; layerId: number };

const target = { anyOf: [{ type: 'integer', minimum: 1 }, { type: 'string', minLength: 1 }] };
const baseProperties = { type: { type: 'string' }, compId: target, layerId: { type: 'integer', minimum: 1 } };
const actionSchemas = [
  { type: 'object', required: ['type'], properties: { type: { const: 'project.context' } }, additionalProperties: false },
  { type: 'object', required: ['type', 'id', 'name', 'width', 'height', 'duration', 'frameRate'], properties: { type: { const: 'comp.create' }, id: { type: 'string' }, name: { type: 'string' }, width: { type: 'integer', minimum: 1, maximum: 30000 }, height: { type: 'integer', minimum: 1, maximum: 30000 }, duration: { type: 'number', exclusiveMinimum: 0 }, frameRate: { type: 'number', exclusiveMinimum: 0, maximum: 240 } }, additionalProperties: false },
  { type: 'object', required: ['type', 'compId', 'name', 'text'], properties: { type: { const: 'layer.text.create' }, compId: target, name: { type: 'string' }, text: { type: 'string' } }, additionalProperties: false },
  { type: 'object', required: ['type', 'compId', 'name'], properties: { type: { const: 'layer.shape.create' }, compId: target, name: { type: 'string' } }, additionalProperties: false },
  { type: 'object', required: ['type', 'compId', 'name', 'color', 'width', 'height', 'duration'], properties: { type: { const: 'layer.solid.create' }, compId: target, name: { type: 'string' }, color: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number', minimum: 0, maximum: 1 } }, width: { type: 'integer', minimum: 1 }, height: { type: 'integer', minimum: 1 }, duration: { type: 'number', exclusiveMinimum: 0 } }, additionalProperties: false },
  ...['property.set', 'keyframe.set', 'keyframe.delete', 'expression.set'].map((kind) => ({ type: 'object', required: ['type', 'compId', 'layerId', 'propertyPath', ...(kind === 'keyframe.set' ? ['time', 'value'] : kind === 'keyframe.delete' ? ['keyIndex'] : kind === 'expression.set' ? ['expression'] : ['value'])], properties: { ...baseProperties, type: { const: kind }, propertyPath: { type: 'array', minItems: 1, items: { type: 'string' } }, time: { type: 'number', minimum: 0 }, value: {}, keyIndex: { type: 'integer', minimum: 1 }, expression: { type: 'string' } }, additionalProperties: false })),
  { type: 'object', required: ['type', 'compId', 'layerId', 'matchName'], properties: { ...baseProperties, type: { const: 'effect.add' }, matchName: { type: 'string' } }, additionalProperties: false },
  { type: 'object', required: ['type', 'compId', 'layerId', 'effectMatchName', 'parameterMatchName', 'value'], properties: { ...baseProperties, type: { const: 'effect.parameter.set' }, effectMatchName: { type: 'string' }, parameterMatchName: { type: 'string' }, value: {} }, additionalProperties: false },
  { type: 'object', required: ['type', 'path'], properties: { type: { const: 'footage.import' }, path: { type: 'string', minLength: 1 } }, additionalProperties: false },
  { type: 'object', required: ['type', 'compId', 'layerId'], properties: { ...baseProperties, type: { const: 'layer.delete' } }, additionalProperties: false },
];

const schema = { type: 'object', required: ['version', 'summary', 'risk', 'projectRevision', 'actions'], properties: { version: { const: 'ae-actions/v1' }, summary: { type: 'string', minLength: 1 }, risk: { enum: ['low', 'medium', 'high'] }, projectRevision: { type: 'string', minLength: 1 }, actions: { type: 'array', minItems: 1, maxItems: 100, items: { oneOf: actionSchemas } } }, additionalProperties: false };
const validate = new Ajv({ allErrors: true, strict: false }).compile(schema);

export function validateActionPlan(value: unknown): { ok: true; value: AeActionPlan } | { ok: false; errors: string[] } {
  if (validate(value)) return { ok: true, value: value as unknown as AeActionPlan };
  return { ok: false, errors: (validate.errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message}`) };
}

export function requiresDangerConfirmation(actions: Array<{ type: string; [key: string]: unknown }>): boolean {
  return actions.some(({ type }) => type === 'layer.delete' || type === 'keyframe.delete');
}
