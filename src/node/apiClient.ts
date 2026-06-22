import { getByPath } from '../shared/jsonPath';
import type { ApiProfile, ChatMessage } from '../shared/types';

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly details?: unknown) { super(message); }
}

function joinUrl(base: string, endpoint: string): string {
  return `${base.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`;
}

export class ApiClient {
  constructor(private readonly profile: ApiProfile, private readonly apiKey: string, private readonly fetcher: typeof fetch = fetch) {}

  private async request(endpoint: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.profile.timeoutMs);
    try {
      const response = await this.fetcher(joinUrl(this.profile.baseUrl, endpoint), {
        ...init,
        signal: controller.signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', ...this.profile.headers, ...init.headers },
      });
      const text = await response.text();
      let body: unknown;
      try { body = text ? JSON.parse(text) : {}; } catch { body = text; }
      if (!response.ok) throw new ApiError(this.describeHttpError(response.status), response.status, body);
      return body;
    } catch (error) {
      if ((error as Error).name === 'AbortError') throw new ApiError('请求超时，请检查网络或增大超时时间');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  private describeHttpError(status: number): string {
    if (status === 401 || status === 403) return '认证失败，请检查 API Key 和接口权限';
    if (status === 429) return '请求过于频繁或额度不足，请稍后重试并检查余额';
    return `API 请求失败（HTTP ${status}）`;
  }

  async listModels(): Promise<Array<{ id: string; contextWindow?: number }>> {
    if (!this.profile.models) return [];
    const body = await this.request(this.profile.models.endpoint);
    const ids = getByPath(body, this.profile.models.idPath);
    const contexts = this.profile.models.contextPath ? getByPath(body, this.profile.models.contextPath) : [];
    const idList = Array.isArray(ids) ? ids : ids ? [ids] : [];
    const contextList = Array.isArray(contexts) ? contexts : contexts ? [contexts] : [];
    return idList.map((id, index) => ({ id: String(id), ...(Number(contextList[index]) > 0 ? { contextWindow: Number(contextList[index]) } : {}) }));
  }

  async getBalance(): Promise<{ amount: number; currency?: string } | null> {
    const config = this.profile.balance;
    if (!config) return null;
    const body = await this.request(config.endpoint, { method: config.method });
    const amount = Number(getByPath(body, config.amountPath));
    if (!Number.isFinite(amount)) throw new ApiError('余额接口返回结构与配置不匹配');
    const currencyValue = config.currencyPath ? getByPath(body, config.currencyPath) : undefined;
    return { amount, ...(currencyValue ? { currency: String(currencyValue) } : {}) };
  }

  async submitVideo(prompt: string, options: { ratio: string; duration: number }): Promise<string> {
    const config = this.profile.video;
    if (!config) throw new ApiError('该 API 档案未配置视频能力');
    const body = await this.request(config.submitEndpoint, { method: 'POST', body: JSON.stringify({ model: config.model, prompt, ...options }) });
    const taskId = getByPath(body, config.taskIdPath);
    if (!taskId) throw new ApiError('视频提交响应中找不到任务 ID');
    return String(taskId);
  }

  async *streamChat(messages: Array<Pick<ChatMessage, 'role' | 'content'>>): AsyncGenerator<{ type: 'text'; text: string } | { type: 'usage'; input: number; output: number }> {
    const config = this.profile.chat;
    if (!config) throw new ApiError('该 API 档案未配置聊天能力');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.profile.timeoutMs);
    try {
      const response = await this.fetcher(joinUrl(this.profile.baseUrl, config.endpoint), {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', ...this.profile.headers },
        body: JSON.stringify({ model: config.model, messages, stream: true, stream_options: { include_usage: true }, ...(config.structuredOutput === 'json_object' ? { response_format: { type: 'json_object' } } : {}) }),
      });
      if (!response.ok) throw new ApiError(this.describeHttpError(response.status), response.status, await response.text());
      const raw = await response.text();
      for (const line of raw.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        const event = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        const text = event.choices?.[0]?.delta?.content;
        if (text) yield { type: 'text', text };
        if (event.usage) yield { type: 'usage', input: event.usage.prompt_tokens ?? 0, output: event.usage.completion_tokens ?? 0 };
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async generateImage(prompt: string, options: { size: string }): Promise<{ kind: 'url' | 'base64'; value: string }> {
    const config = this.profile.image;
    if (!config) throw new ApiError('该 API 档案未配置图片能力');
    const body = await this.request(config.endpoint, { method: 'POST', body: JSON.stringify({ model: config.model, prompt, ...options }) });
    const first = (body as { data?: Array<{ url?: string; b64_json?: string }> }).data?.[0];
    if (first?.url) return { kind: 'url', value: first.url };
    if (first?.b64_json) return { kind: 'base64', value: first.b64_json };
    throw new ApiError('图片接口未返回 URL 或 base64 数据');
  }

  async getVideoStatus(taskId: string): Promise<{ state: 'polling' | 'ready' | 'failed'; url?: string; error?: string }> {
    const config = this.profile.video;
    if (!config) throw new ApiError('该 API 档案未配置视频能力');
    const body = await this.request(config.statusEndpoint.replace('{taskId}', encodeURIComponent(taskId)));
    const status = String(getByPath(body, config.statusPath) ?? '');
    if (config.successValues.includes(status)) {
      const url = getByPath(body, config.resultUrlPath);
      if (!url) throw new ApiError('视频任务成功，但响应中找不到下载地址');
      return { state: 'ready', url: String(url) };
    }
    if (config.failureValues.includes(status)) return { state: 'failed', error: String(getByPath(body, config.errorPath) ?? '视频生成失败') };
    return { state: 'polling' };
  }
}
