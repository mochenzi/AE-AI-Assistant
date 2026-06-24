# Chat Empty Response Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect successful-but-empty streamed chat responses and retry JSON Object requests once without `response_format`.

**Architecture:** `ApiClient` parses each complete SSE response into buffered events before yielding anything. A JSON Object request with no final `delta.content` gets one prompt-only fallback; reasoning-only output never becomes assistant content.

**Tech Stack:** TypeScript, Fetch API, Vitest

---

### Task 1: Buffer and classify chat SSE responses

**Files:**
- Modify: `src/node/apiClient.ts`
- Test: `tests/api-client.test.ts`

- [ ] **Step 1: Write failing parser and retry tests**

Append tests that collect `streamChat()` and assert all four cases:

```ts
async function collect(client: ApiClient) {
  const events = [];
  for await (const event of client.streamChat([{ role: 'user', content: '创建圆形' }])) events.push(event);
  return events;
}

test('retries an empty JSON response once without response_format', async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const responses = [
    'data: {"choices":[{"delta":{"reasoning_content":"分析中"}}]}\n\ndata: [DONE]\n\n',
    'data: {"choices":[{"delta":{"content":"{\\"kind\\":\\"chat\\",\\"message\\":\\"好了\\"}"}}]}\n\ndata: [DONE]\n\n',
  ];
  const fetcher: typeof fetch = async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(responses.shift(), { status: 200 });
  };
  await expect(collect(new ApiClient(profile, 'secret', fetcher))).resolves.toEqual([
    { type: 'text', text: '{"kind":"chat","message":"好了"}' },
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
  const fetcher: typeof fetch = async () => new Response('data: {"choices":[{"delta":{"reasoning_content":"仍在想"}}]}\n\ndata: [DONE]\n\n');
  await expect(collect(new ApiClient(profile, 'secret', fetcher))).rejects.toThrow('模型连续返回空内容');
});

test('does not retry an empty prompt-only response', async () => {
  const promptOnly = { ...profile, chat: { ...profile.chat!, structuredOutput: 'prompt_only' as const } };
  let calls = 0;
  const fetcher: typeof fetch = async () => { calls += 1; return new Response('data: [DONE]\n\n'); };
  await expect(collect(new ApiClient(promptOnly, 'secret', fetcher))).rejects.toThrow('模型没有返回内容');
  expect(calls).toBe(1);
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npm test -- tests/api-client.test.ts`

Expected: FAIL because empty responses currently resolve and no retry occurs.

- [ ] **Step 3: Implement a buffered SSE attempt**

Add these focused internal types and helpers in `src/node/apiClient.ts`:

```ts
type ChatEvent = { type: 'text'; text: string } | { type: 'usage'; input: number; output: number };
type ChatAttempt = { events: ChatEvent[]; hasContent: boolean; hasReasoning: boolean };

function parseChatSse(raw: string): ChatAttempt {
  const events: ChatEvent[] = [];
  let hasContent = false;
  let hasReasoning = false;
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    const event = JSON.parse(payload) as {
      choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const delta = event.choices?.[0]?.delta;
    if (delta?.content) { hasContent = true; events.push({ type: 'text', text: delta.content }); }
    if (delta?.reasoning_content) hasReasoning = true;
    if (event.usage) events.push({ type: 'usage', input: event.usage.prompt_tokens ?? 0, output: event.usage.completion_tokens ?? 0 });
  }
  return { events, hasContent, hasReasoning };
}
```

Create `private async chatAttempt(messages, includeResponseFormat): Promise<ChatAttempt>` from the existing fetch block. Its request body must include `response_format` only when `includeResponseFormat` is true, preserve timeout and HTTP error handling, and return `parseChatSse(await response.text())`.

Replace `streamChat()` with:

```ts
async *streamChat(messages: Array<Pick<ChatMessage, 'role' | 'content'>>): AsyncGenerator<ChatEvent> {
  const config = this.profile.chat;
  if (!config) throw new ApiError('该 API 档案未配置聊天能力');
  const jsonMode = config.structuredOutput === 'json_object';
  let attempt = await this.chatAttempt(messages, jsonMode);
  if (!attempt.hasContent && jsonMode) attempt = await this.chatAttempt(messages, false);
  if (!attempt.hasContent) {
    throw new ApiError(jsonMode ? '模型连续返回空内容，请重试或将结构化输出改为纯提示词' : '模型没有返回内容，请重试');
  }
  for (const event of attempt.events) yield event;
}
```

- [ ] **Step 4: Run focused tests**

Run: `npm test -- tests/api-client.test.ts`

Expected: all API client tests PASS; the first empty attempt emits no text or usage.

- [ ] **Step 5: Commit**

```powershell
git add src/node/apiClient.ts tests/api-client.test.ts
git commit -m "fix: retry empty structured chat responses"
```

### Task 2: Verify integration and install

**Files:**
- Verify: `src/ui/App.tsx`
- Verify: `src/shared/actionResponse.ts`

- [ ] **Step 1: Run the complete check**

Run: `npm run check`

Expected: all Vitest tests pass and both Vite builds finish without TypeScript errors.

- [ ] **Step 2: Install the verified build into AE**

Run: `npm run install:ae`

Expected: build succeeds and the extension is mirrored to `%APPDATA%\Adobe\CEP\extensions\com.chenyu.aeaiassistant`.

- [ ] **Step 3: Manually verify the reported failure**

In AE 25 or 26, select the DeepSeek profile, switch to “操作 AE”, and send an action request. Verify that a provider empty JSON response triggers at most one fallback request and the UI either shows a real reply/action preview or the explicit empty-response error. It must never append `AI 没有返回内容。` as a conversation message.

- [ ] **Step 4: Commit any test-only verification update if required**

If no files changed, do not create an empty commit. If a mock fixture was added:

```powershell
git add tests
git commit -m "test: cover empty chat recovery integration"
```
