import { request as httpRequest, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';

function abortError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

function normalizeHeaders(headers?: HeadersInit): Record<string, string> {
  if (!headers) return {};
  if (Array.isArray(headers)) return Object.fromEntries(headers.map(([key, value]) => [key, String(value)]));
  if (typeof (headers as Headers).forEach === 'function') {
    const result: Record<string, string> = {};
    (headers as Headers).forEach((value, key) => { result[key] = value; });
    return result;
  }
  return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, String(value)]));
}

function bodyBuffer(body: BodyInit | null | undefined): Buffer | undefined {
  if (body == null) return undefined;
  if (typeof body === 'string') return Buffer.from(body, 'utf8');
  if (body instanceof URLSearchParams) return Buffer.from(body.toString(), 'utf8');
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  throw new Error('Node HTTP 传输暂不支持该请求体类型');
}

export function createNodeRequestOptions(url: URL, method: string, headers: Record<string, string>): RequestOptions {
  return {
    protocol: url.protocol,
    hostname: url.hostname,
    ...(url.port ? { port: url.port } : {}),
    path: `${url.pathname}${url.search}`,
    method,
    headers,
  };
}

async function requestWithNode(input: RequestInfo | URL, init: RequestInit = {}, redirects = 0): Promise<Response> {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`不支持的网络协议：${url.protocol}`);
  if (init.signal?.aborted) throw abortError();

  const body = bodyBuffer(init.body);
  const headers: Record<string, string> = { 'Accept-Encoding': 'identity', ...normalizeHeaders(init.headers) };
  if (body && !Object.keys(headers).some((key) => key.toLowerCase() === 'content-length')) headers['Content-Length'] = String(body.byteLength);
  const method = init.method || (body ? 'POST' : 'GET');
  const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;

  return new Promise<Response>((resolve, reject) => {
    const request = transport(createNodeRequestOptions(url, method, headers), (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if (location && [301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        if (redirects >= 5) { reject(new Error('网络请求重定向次数过多')); return; }
        const switchToGet = [301, 302, 303].includes(status) && method !== 'GET' && method !== 'HEAD';
        const nextInit = switchToGet ? { ...init, method: 'GET', body: undefined } : init;
        requestWithNode(new URL(location, url), nextInit, redirects + 1).then(resolve, reject);
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        const data = Buffer.concat(chunks);
        const result = {
          ok: status >= 200 && status < 300,
          status,
          statusText: response.statusMessage || '',
          url: url.toString(),
          redirected: redirects > 0,
          text: async () => data.toString('utf8'),
          json: async () => JSON.parse(data.toString('utf8')),
          arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        } as unknown as Response;
        resolve(result);
      });
      response.on('error', reject);
    });
    const onAbort = () => request.destroy(abortError());
    init.signal?.addEventListener('abort', onAbort, { once: true });
    request.on('close', () => init.signal?.removeEventListener('abort', onAbort));
    request.on('error', reject);
    if (body) request.write(body);
    request.end();
  });
}

export const nodeFetch = requestWithNode as typeof fetch;
