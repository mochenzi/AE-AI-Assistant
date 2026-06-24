import { afterEach, describe, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { ConversationStore } from '../src/node/conversationStore';
import { createRuntime } from '../src/node/cepRuntime';

const now = '2026-06-24T08:00:00.000Z';
const project = { key: 'project-a', label: '片头.aep', unsaved: false };
const markdown = { name: 'notes.md', sourcePath: 'D:/notes.md', content: '# 分镜' };

describe('ConversationStore', () => {
  let directory = '';

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.doUnmock('node:fs/promises');
    vi.resetModules();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  test('stores one atomic JSON document per conversation and rebuilds summaries', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    const created = await store.create(project, [markdown], 'c1', now);
    created.title = '圆形动画';
    created.messages.push({ role: 'user', content: '创建圆形' });
    created.updatedAt = '2026-06-24T09:00:00.000Z';
    await store.write(created);

    await expect(store.read('project-a', 'c1')).resolves.toEqual(created);
    await expect(store.list('project-a')).resolves.toEqual([
      expect.objectContaining({ id: 'c1', title: '圆形动画' }),
    ]);
    await expect(store.search('圆形')).resolves.toEqual([
      expect.objectContaining({ id: 'c1' }),
    ]);
    expect((await readdir(join(directory, 'project-a'))).some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  test('sorts all project summaries by updated time and supports rename', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    const first = await store.create(project, [], 'c1', now);
    const second = await store.create({ key: 'project-b', label: 'B.aep', unsaved: false }, [], 'c2', '2026-06-24T10:00:00.000Z');

    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({ id: second.id }),
      expect.objectContaining({ id: first.id }),
    ]);
    await expect(store.rename(first.project.key, first.id, '新标题')).resolves.toEqual(
      expect.objectContaining({ title: '新标题' }),
    );
  });

  test('isolates malformed JSON and continues listing healthy conversations', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    await store.create(project, [], 'healthy', now);
    await writeFile(join(directory, project.key, 'broken.json'), '{"apiKey":"super-secret", bad', 'utf8');

    await expect(store.list(project.key)).resolves.toEqual([
      expect.objectContaining({ id: 'healthy' }),
    ]);
    const names = await readdir(join(directory, project.key));
    expect(names).toContain('broken.json.corrupt');
    expect(names).not.toContain('broken.json');
  });

  test('rejects a missing external root without creating it', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const missing = join(directory, 'missing');

    await expect(new ConversationStore(missing).assertWritable()).rejects.toThrow('会话目录');
    await expect(readdir(missing)).rejects.toThrow();
  });

  test('rejects path traversal in project keys and conversation ids', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const selected = join(directory, 'selected');
    await mkdir(selected);
    const store = new ConversationStore(selected);

    await expect(store.create({ ...project, key: '..' }, [], 'escaped', now)).rejects.toThrow('无效');
    await expect(store.create(project, [], '../escaped', now)).rejects.toThrow('无效');
    await expect(readFile(join(directory, 'escaped.json'), 'utf8')).rejects.toThrow();
  });

  test('moves conversations into an existing project without overwriting unrelated conversations', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    await store.create(project, [], 'c1', now);
    await store.create({ key: 'project-b', label: 'B-old.aep', unsaved: false }, [], 'other', now);

    await store.moveProject(project.key, { key: 'project-b', label: 'B.aep', unsaved: false });

    await expect(store.read('project-b', 'c1')).resolves.toEqual(
      expect.objectContaining({ id: 'c1', project: { key: 'project-b', label: 'B.aep', unsaved: false } }),
    );
    await expect(store.read('project-b', 'other')).resolves.toEqual(expect.objectContaining({ id: 'other' }));
    await expect(store.read(project.key, 'c1')).rejects.toThrow();
  });

  test('preflights move conflicts and leaves every source conversation unchanged', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    const source = await store.create(project, [], 'same', now);
    const targetProject = { key: 'project-b', label: 'B.aep', unsaved: false };
    const target = await store.create(targetProject, [], 'same', '2026-06-24T10:00:00.000Z');

    await expect(store.moveProject(project.key, targetProject)).rejects.toThrow('冲突');
    await expect(store.read(project.key, 'same')).resolves.toEqual(source);
    await expect(store.read(targetProject.key, 'same')).resolves.toEqual(target);
  });

  test('does not overwrite a conflict that appears during move preflight', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const realFs = await import('node:fs/promises');
    const seed = new ConversationStore(directory);
    const source = await seed.create(project, [], 'same', now);
    const targetProject = { key: 'project-b', label: 'B.aep', unsaved: false };
    const target = await seed.create(targetProject, [], 'same', '2026-06-24T10:00:00.000Z');
    const targetPath = join(directory, targetProject.key, 'same.json');
    vi.doMock('node:fs/promises', async () => ({
      ...realFs,
      stat: async (path: string) => {
        if (path === targetPath) throw Object.assign(new Error('simulated stale preflight'), { code: 'ENOENT' });
        return realFs.stat(path);
      },
    }));
    const { ConversationStore: RacingStore } = await import('../src/node/conversationStore');
    const store = new RacingStore(directory);

    await expect(store.moveProject(project.key, targetProject)).rejects.toThrow('冲突');
    await expect(seed.read(project.key, 'same')).resolves.toEqual(source);
    await expect(seed.read(targetProject.key, 'same')).resolves.toEqual(target);
  });

  test('rolls back files already moved when a later rename fails', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const realFs = await import('node:fs/promises');
    const seed = new ConversationStore(directory);
    const first = await seed.create(project, [], 'c1', now);
    const second = await seed.create(project, [], 'c2', now);
    let forwardRenames = 0;
    vi.doMock('node:fs/promises', async () => ({
      ...realFs,
      rename: async (from: string, to: string) => {
        const isForwardMove = from.includes(`${project.key}`) && to.includes('project-b') && from.endsWith('.json');
        if (isForwardMove && ++forwardRenames === 2) throw new Error('injected move failure');
        return realFs.rename(from, to);
      },
    }));
    const { ConversationStore: FailureStore } = await import('../src/node/conversationStore');
    const store = new FailureStore(directory);

    await expect(store.moveProject(project.key, { key: 'project-b', label: 'B.aep', unsaved: false })).rejects.toThrow('移动会话失败');
    await expect(store.read(project.key, 'c1')).resolves.toEqual(first);
    await expect(store.read(project.key, 'c2')).resolves.toEqual(second);
    await expect(store.list('project-b')).resolves.toEqual([]);
  });
});

describe('CepRuntime conversation methods', () => {
  let directory = '';

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  test('reads each Markdown file as UTF-8 and persists snapshots when creating', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-runtime-'));
    const markdownPath = join(directory, '上下文.md');
    await writeFile(markdownPath, '# 品牌上下文', 'utf8');

    const created = await createRuntime().createConversation(directory, project, [markdownPath], 'c1', now);

    expect(created.markdownSnapshots).toEqual([{
      name: basename(markdownPath),
      sourcePath: markdownPath,
      content: '# 品牌上下文',
    }]);
    await expect(readFile(join(directory, project.key, 'c1.json'), 'utf8')).resolves.toContain('品牌上下文');
  });

  test('does not create a partial conversation when any Markdown read fails or leak a sensitive path', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-runtime-'));
    const valid = join(directory, 'valid.md');
    const secret = 'sk-do-not-leak';
    const missing = join(directory, secret, 'missing.md');
    await writeFile(valid, 'private body that must not leak', 'utf8');

    let caught: unknown;
    try {
      await createRuntime().createConversation(directory, project, [valid, missing], 'c1', now);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain('无法读取 Markdown「missing.md」');
    expect((caught as Error).message).not.toContain(secret);
    expect((caught as Error).message).not.toContain('private body');
    await expect(readdir(join(directory, project.key))).rejects.toThrow();
  });
});
