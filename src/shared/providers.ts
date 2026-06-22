import type { ApiProfile, ProviderId } from './types';

export type ProviderPreset = Omit<ApiProfile, 'id' | 'providerId' | 'cachedModels' | 'modelsUpdatedAt'> & {
  id: ProviderId;
};

const chat = (contextWindow?: number): NonNullable<ApiProfile['chat']> => ({
  model: '', endpoint: '/chat/completions', structuredOutput: 'json_object', contextWindow,
});
const image = (): NonNullable<ApiProfile['image']> => ({ model: '', endpoint: '/images/generations' });
const video = (): NonNullable<ApiProfile['video']> => ({
  model: '', submitEndpoint: '/videos', statusEndpoint: '/videos/{taskId}', taskIdPath: 'id',
  statusPath: 'status', resultUrlPath: 'result.url', errorPath: 'error.message',
  successValues: ['completed', 'done', 'succeeded'], failureValues: ['failed', 'error', 'cancelled'],
});
const models = (): NonNullable<ApiProfile['models']> => ({
  endpoint: '/models', idPath: 'data[*].id', contextPath: 'data[*].context_length',
});

const PRESETS: readonly ProviderPreset[] = [
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', timeoutMs: 120000, capabilities: ['chat', 'image'], headers: {}, chat: chat(), image: image(), models: models() },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', timeoutMs: 120000, capabilities: ['chat'], headers: {}, chat: chat(), models: models() },
  { id: 'moonshot', name: 'Moonshot / Kimi', baseUrl: 'https://api.moonshot.cn/v1', timeoutMs: 120000, capabilities: ['chat'], headers: {}, chat: chat(), models: models() },
  { id: 'dashscope', name: '阿里云百炼 / 通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', timeoutMs: 120000, capabilities: ['chat'], headers: {}, chat: chat(), models: models() },
  { id: 'zhipu', name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', timeoutMs: 120000, capabilities: ['chat'], headers: {}, chat: chat(), models: models() },
  { id: 'mimo', name: '小米 MiMo', baseUrl: 'https://api.xiaomimimo.com/v1', timeoutMs: 120000, capabilities: ['chat'], headers: {}, chat: chat(), models: models() },
  { id: 'volcengine', name: '火山引擎豆包', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', timeoutMs: 120000, capabilities: ['chat'], headers: {}, chat: chat(), models: models() },
  { id: 'custom', name: '自定义 OpenAI-compatible', baseUrl: '', timeoutMs: 120000, capabilities: ['chat'], headers: {}, chat: chat(), models: models() },
];

function clonePreset(preset: ProviderPreset): ProviderPreset {
  return JSON.parse(JSON.stringify(preset)) as ProviderPreset;
}

export function listProviderPresets(): ProviderPreset[] {
  return PRESETS.map(clonePreset);
}

export function getProviderPreset(id: ProviderId): ProviderPreset {
  const preset = PRESETS.find((item) => item.id === id);
  if (!preset) throw new Error(`未知供应商预设：${id}`);
  return clonePreset(preset);
}

export function createProfileFromPreset(providerId: ProviderId, id: string): ApiProfile {
  const { id: _presetId, ...preset } = getProviderPreset(providerId);
  return { ...preset, id, providerId, cachedModels: [] };
}
