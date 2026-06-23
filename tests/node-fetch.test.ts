import { afterEach, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import { createNodeRequestOptions, nodeFetch } from '../src/node/nodeFetch';

describe('CEP Node HTTP transport', () => {
  let server: Server | undefined;

  afterEach(async () => {
    if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  });

  test('converts URLs to plain Node request options for CEP cross-realm compatibility', () => {
    const options = createNodeRequestOptions(
      new URL('https://api.example.com:8443/v1/models?capability=chat'),
      'GET',
      { Authorization: 'Bearer secret' },
    );

    expect(options).toEqual({
      protocol: 'https:',
      hostname: 'api.example.com',
      port: '8443',
      path: '/v1/models?capability=chat',
      method: 'GET',
      headers: { Authorization: 'Bearer secret' },
    });
    expect(Object.getPrototypeOf(options)).toBe(Object.prototype);
  });

  test('sends requests through Node HTTP and returns a fetch-compatible response', async () => {
    let received = { method: '', authorization: '', body: '' };
    server = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        received = {
          method: request.method || '',
          authorization: String(request.headers.authorization || ''),
          body: Buffer.concat(chunks).toString('utf8'),
        };
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server did not start');

    const response = await nodeFetch(`http://127.0.0.1:${address.port}/models`, {
      method: 'POST',
      headers: { Authorization: 'Bearer secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'test' }),
    });

    expect(response.ok).toBe(true);
    expect(await response.text()).toBe('{"ok":true}');
    expect(received).toEqual({ method: 'POST', authorization: 'Bearer secret', body: '{"model":"test"}' });
  });
});
