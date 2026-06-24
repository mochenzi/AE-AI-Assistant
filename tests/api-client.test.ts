import { describe, expect, test } from 'vitest';
import { ApiClient, ApiError } from '../src/node/apiClient';
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
  test('uses the global receiver required by CEP native fetch', async () => {
    let receiver: unknown;
    const nativeLikeFetch = function (this: unknown) {
      receiver = this;
      return Promise.resolve(new Response(JSON.stringify({ data: [] }), { status: 200 }));
    } as typeof fetch;

    const client = new ApiClient(profile, 'secret', nativeLikeFetch);
    await client.listModels();

    expect(receiver).toBe(globalThis);
  });

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

async function collect(client: ApiClient) {
  const events = [];
  for await (const event of client.streamChat([{ role: 'user', content: '创建圆形' }])) events.push(event);
  return events;
}

test('retries an empty JSON response once without response_format', async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const responses = [
    'data: {"choices":[{"delta":{"reasoning_content":"分析中"}}]}\n\ndata: {"usage":{"prompt_tokens":9,"completion_tokens":4}}\n\ndata: [DONE]\n\n',
    'data: {"choices":[{"delta":{"content":"{\\"kind\\":\\"chat\\",\\"message\\":\\"好了\\"}"}}]}\n\ndata: {"usage":{"prompt_tokens":10,"completion_tokens":5}}\n\ndata: [DONE]\n\n',
  ];
  const fetcher: typeof fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(responses.shift(), { status: 200 });
  };
  await expect(collect(new ApiClient(profile, 'secret', fetcher))).resolves.toEqual([
    { type: 'text', text: '{"kind":"chat","message":"好了"}' },
    { type: 'usage', input: 10, output: 5 },
  ]);
  expect(bodies).toHaveLength(2);
  expect(bodies[0]).toHaveProperty('response_format');
  expect(bodies[1]).not.toHaveProperty('response_format');
});

test('does not retry a non-empty first response', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response('data: {"choices":[{"delta":{"content":"正常"}}]}\n\ndata: [DONE]\n\n');
  };
  await expect(collect(new ApiClient(profile, 'secret', fetcher))).resolves.toEqual([{ type: 'text', text: '正常' }]);
  expect(calls).toBe(1);
});

test('rejects after two empty JSON responses', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response('data: {"choices":[{"delta":{"reasoning_content":"仍在想"}}]}\n\ndata: [DONE]\n\n');
  };
  await expect(collect(new ApiClient(profile, 'secret', fetcher))).rejects.toThrow('模型连续返回空内容');
  expect(calls).toBe(2);
});

test('does not retry an empty prompt-only response', async () => {
  const promptOnly = { ...profile, chat: { ...profile.chat!, structuredOutput: 'prompt_only' as const } };
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls += 1; return new Response('data: [DONE]\n\n'); };
  await expect(collect(new ApiClient(promptOnly, 'secret', fetcher))).rejects.toThrow('模型没有返回内容');
  expect(calls).toBe(1);
});

test('does not retry a non-2xx chat response', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response('upstream failed', { status: 503 });
  };
  let caught: unknown;
  try {
    await collect(new ApiClient(profile, 'secret', fetcher));
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ApiError);
  expect(caught).toMatchObject({ status: 503, message: 'API 请求失败（HTTP 503）' });
  expect(calls).toBe(1);
});

test('does not retry an aborted chat request and reports a timeout', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    const error = new Error('aborted');
    error.name = 'AbortError';
    throw error;
  };
  let caught: unknown;
  try {
    await collect(new ApiClient(profile, 'secret', fetcher));
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(ApiError);
  expect(caught).toMatchObject({ message: '请求超时，请检查网络或增大超时时间' });
  expect(calls).toBe(1);
});
