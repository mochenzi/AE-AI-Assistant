import { describe, expect, test } from 'vitest';
import { ApiClient } from '../src/node/apiClient';
import type { ApiProfile } from '../src/shared/types';

const profile: ApiProfile = {
  id: 'p1', name: '测试', baseUrl: 'https://api.test/v1', timeoutMs: 1000, capabilities: ['chat', 'image', 'video'], headers: {},
  chat: { model: 'model-a', endpoint: '/chat/completions', structuredOutput: 'json_object', contextWindow: 10000 },
  image: { model: 'image-a', endpoint: '/images/generations' },
  video: { model: 'video-a', submitEndpoint: '/videos', statusEndpoint: '/videos/{taskId}', taskIdPath: 'id', statusPath: 'status', resultUrlPath: 'result.url', errorPath: 'error.message', successValues: ['done'], failureValues: ['failed'] },
  models: { endpoint: '/models', idPath: 'data[*].id', contextPath: 'data[*].context_length' },
  balance: { method: 'GET', endpoint: '/balance', amountPath: 'data.balance', currencyPath: 'data.currency' },
};

describe('API client', () => {
  test('normalizes model and balance responses through configured paths', async () => {
    const fetcher: typeof fetch = async (url) => {
      const value = String(url);
      return new Response(value.endsWith('/models')
        ? JSON.stringify({ data: [{ id: 'm1', context_length: 128000 }] })
        : JSON.stringify({ data: { balance: 42.5, currency: 'CNY' } }), { status: 200 });
    };
    const client = new ApiClient(profile, 'secret', fetcher);
    await expect(client.listModels()).resolves.toEqual([{ id: 'm1', contextWindow: 128000 }]);
    await expect(client.getBalance()).resolves.toEqual({ amount: 42.5, currency: 'CNY' });
  });

  test('parses a submitted asynchronous video task', async () => {
    const fetcher: typeof fetch = async () => new Response(JSON.stringify({ id: 'task-7' }), { status: 200 });
    const client = new ApiClient(profile, 'secret', fetcher);
    await expect(client.submitVideo('流动的霓虹字幕', { ratio: '16:9', duration: 5 })).resolves.toBe('task-7');
  });

  test('streams chat completion chunks and usage', async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"你好"}}]}',
      'data: {"choices":[{"delta":{"content":"，AE"}}],"usage":{"prompt_tokens":12,"completion_tokens":3}}',
      'data: [DONE]',
      '',
    ].join('\n\n');
    const fetcher: typeof fetch = async () => new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    const client = new ApiClient(profile, 'secret', fetcher);
    const events = [];
    for await (const event of client.streamChat([{ role: 'user', content: '打招呼' }])) events.push(event);
    expect(events).toEqual([{ type: 'text', text: '你好' }, { type: 'text', text: '，AE' }, { type: 'usage', input: 12, output: 3 }]);
  });

  test('normalizes image and video status responses', async () => {
    let count = 0;
    const fetcher: typeof fetch = async () => new Response(JSON.stringify(count++ === 0
      ? { data: [{ b64_json: 'aGVsbG8=' }] }
      : { status: 'done', result: { url: 'https://cdn.test/video.mp4' } }), { status: 200 });
    const client = new ApiClient(profile, 'secret', fetcher);
    await expect(client.generateImage('蓝色粒子', { size: '1024x1024' })).resolves.toEqual({ kind: 'base64', value: 'aGVsbG8=' });
    await expect(client.getVideoStatus('task-7')).resolves.toEqual({ state: 'ready', url: 'https://cdn.test/video.mp4' });
  });
});
