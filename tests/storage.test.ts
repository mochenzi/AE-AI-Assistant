import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AtomicJsonStore } from '../src/node/atomicStore';

describe('atomic JSON store', () => {
  let directory = '';
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

  test('persists defaults and updates without leaving a temporary file', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-'));
    const path = join(directory, 'state.json');
    const store = new AtomicJsonStore(path, { count: 0 });
    expect(await store.read()).toEqual({ count: 0 });
    await store.update((state) => ({ count: state.count + 1 }));
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ count: 1 });
    await expect(readFile(`${path}.tmp`, 'utf8')).rejects.toThrow();
  });
});
