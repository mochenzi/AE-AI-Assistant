import { afterEach, describe, expect, test, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
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
    expect(names.some((name) => name.startsWith('broken.json.') && name.endsWith('.corrupt'))).toBe(true);
    expect(names).not.toContain('broken.json');
  });

  test('refuses a project junction that escapes the selected root', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const selected = join(directory, 'selected');
    const outside = join(directory, 'outside');
    await mkdir(selected);
    await mkdir(outside);
    await symlink(outside, join(selected, project.key), 'junction');
    const store = new ConversationStore(selected);

    await expect(store.create(project, [], 'escaped', now)).rejects.toThrow('不安全');
    await expect(readFile(join(outside, 'escaped.json'), 'utf8')).rejects.toThrow();
  });

  test('rejects a missing external root without creating it', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const missing = join(directory, 'missing');

    await expect(new ConversationStore(missing).assertWritable()).rejects.toThrow('会话目录');
    await expect(readdir(missing)).rejects.toThrow();
  });

  test('does not leak a sensitive root path in read errors', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const secret = 'token=store-secret-value';
    const selected = join(directory, secret);
    await mkdir(selected);
    const store = new ConversationStore(selected);

    let message = '';
    try {
      await store.read(project.key, 'missing');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain('store-secret-value');
    expect(message).toMatch(/ENOENT|不存在/);
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

  test('searches message content locally as well as title and project label', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    const document = await store.create(project, [], 'message-hit', now);
    document.messages.push({ role: 'user', content: 'needle only in private message body' });
    await store.write(document);

    await expect(store.search('needle only')).resolves.toEqual([
      expect.objectContaining({ id: 'message-hit' }),
    ]);
  });

  test('quarantines documents whose stored identity does not match their path', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    const document = await store.create(project, [], 'c1', now);
    document.project = { key: 'project-b', label: 'B.aep', unsaved: false };
    await writeFile(join(directory, project.key, 'c1.json'), JSON.stringify(document), 'utf8');

    await expect(store.read(project.key, 'c1')).rejects.toThrow('损坏');
    await expect(store.list(project.key)).resolves.toEqual([]);
    expect((await readdir(join(directory, project.key))).some((name) => name.endsWith('.corrupt'))).toBe(true);
  });

  test('rename cannot follow a forged identity into another project', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    const victim = await store.create({ key: 'project-b', label: 'B.aep', unsaved: false }, [], 'victim', now);
    await mkdir(join(directory, project.key));
    await writeFile(join(directory, project.key, 'alias.json'), JSON.stringify(victim), 'utf8');

    await expect(store.rename(project.key, 'alias', 'overwritten')).rejects.toThrow('损坏');
    await expect(store.read('project-b', 'victim')).resolves.toEqual(victim);
  });

  test('quarantines schema-invalid messages without exposing their content', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    const document = await store.create(project, [], 'invalid-schema', now);
    const secretBody = 'schema-secret-body';
    (document.messages as unknown[]) = [{ role: 'hacker', content: secretBody }];
    await writeFile(join(directory, project.key, 'invalid-schema.json'), JSON.stringify(document), 'utf8');

    await expect(store.list(project.key)).resolves.toEqual([]);
    await expect(store.read(project.key, 'invalid-schema')).rejects.not.toThrow(secretBody);
  });

  test('uses collision-proof temporary files for concurrent writes', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    const first = await store.create(project, [], 'same', now);
    const second = structuredClone(first);
    first.title = 'first';
    second.title = 'second';
    vi.spyOn(Date, 'now').mockReturnValue(12345);

    await expect(Promise.all([store.write(first), store.write(second)])).resolves.toBeDefined();
    await expect(store.read(project.key, 'same')).resolves.toEqual(
      expect.objectContaining({ title: expect.stringMatching(/^(first|second)$/) }),
    );
    expect((await readdir(join(directory, project.key))).some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  test('concurrent lists isolate malformed JSON once and both continue', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    await mkdir(join(directory, project.key));
    await writeFile(join(directory, project.key, 'broken.json'), '{bad', 'utf8');

    await expect(Promise.all([store.list(project.key), store.list(project.key)])).resolves.toEqual([[], []]);
    const corrupt = (await readdir(join(directory, project.key))).filter((name) => name.endsWith('.corrupt'));
    expect(corrupt).toHaveLength(1);
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
    let targetChecks = 0;
    vi.doMock('node:fs/promises', async () => ({
      ...realFs,
      lstat: async (path: string) => {
        if (path === targetPath && ++targetChecks === 1) {
          throw Object.assign(new Error('simulated stale preflight'), { code: 'ENOENT' });
        }
        return realFs.lstat(path);
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

  test('does not expose move reservations as conversation JSON', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const realFs = await import('node:fs/promises');
    const seed = new ConversationStore(directory);
    await seed.create(project, [], 'c1', now);
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    vi.doMock('node:fs/promises', async () => ({
      ...realFs,
      rename: async (from: string, to: string) => {
        if (from.endsWith('c1.json') && to.includes('project-b')) {
          entered();
          await releasePromise;
        }
        return realFs.rename(from, to);
      },
    }));
    const { ConversationStore: PausedStore } = await import('../src/node/conversationStore');
    const moving = new PausedStore(directory).moveProject(project.key, { key: 'project-b', label: 'B.aep', unsaved: false });
    await enteredPromise;
    const visibleDuringMove = await seed.list('project-b');
    const namesDuringMove = await readdir(join(directory, 'project-b'));
    release();
    await moving;

    expect(visibleDuringMove).toEqual([]);
    expect(namesDuringMove.some((name) => name.endsWith('.json'))).toBe(false);
  });

  test('coordinates concurrent moves to the same target without losing the loser source', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    await store.create({ key: 'source-a', label: 'A.aep', unsaved: false }, [], 'same', now);
    await store.create({ key: 'source-b', label: 'B.aep', unsaved: false }, [], 'same', now);
    const target = { key: 'target', label: 'Target.aep', unsaved: false };

    const results = await Promise.allSettled([
      store.moveProject('source-a', target),
      store.moveProject('source-b', target),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const remaining = [...await store.list('source-a'), ...await store.list('source-b')];
    expect(remaining).toHaveLength(1);
    await expect(store.read('target', 'same')).resolves.toEqual(expect.objectContaining({ project: target }));
  });

  test('reports move lock cleanup failures instead of reporting success', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const realFs = await import('node:fs/promises');
    const seed = new ConversationStore(directory);
    await seed.create(project, [], 'c1', now);
    vi.doMock('node:fs/promises', async () => ({
      ...realFs,
      unlink: async (path: string) => {
        if (path.endsWith('.move-reservation')) throw Object.assign(new Error('injected cleanup failure'), { code: 'EACCES' });
        return realFs.unlink(path);
      },
    }));
    const { ConversationStore: CleanupFailureStore } = await import('../src/node/conversationStore');

    await expect(new CleanupFailureStore(directory).moveProject(
      project.key,
      { key: 'project-b', label: 'B.aep', unsaved: false },
    )).rejects.toThrow(/EACCES|cleanup/i);
  });

  test('serializes a move with a normal source write so the newest source document is moved once', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const realFs = await import('node:fs/promises');
    const seed = new ConversationStore(directory);
    const original = await seed.create(project, [], 'same', now);
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    vi.doMock('node:fs/promises', async () => ({
      ...realFs,
      rename: async (from: string, to: string) => {
        if (from.endsWith('same.json') && to.includes('project-b')) {
          entered();
          await releasePromise;
        }
        return realFs.rename(from, to);
      },
    }));
    const { ConversationStore: RacingStore } = await import('../src/node/conversationStore');
    const store = new RacingStore(directory);
    const moving = store.moveProject(project.key, { key: 'project-b', label: 'B.aep', unsaved: false });
    await enteredPromise;
    const updated = structuredClone(original);
    updated.title = 'latest source write';
    updated.updatedAt = '2026-06-24T11:00:00.000Z';
    const writing = store.write(updated);
    release();

    await expect(Promise.all([moving, writing])).resolves.toBeDefined();
    await expect(seed.read('project-b', 'same')).resolves.toEqual(
      expect.objectContaining({ title: 'latest source write', project: { key: 'project-b', label: 'B.aep', unsaved: false } }),
    );
    await expect(seed.read(project.key, 'same')).rejects.toThrow();
  });

  test('serializes a move with a source write that already passed the missing-lock check', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const realFs = await import('node:fs/promises');
    const seed = new ConversationStore(directory);
    const original = await seed.create(project, [], 'same', now);
    const sourceDirectory = join(directory, project.key);
    let entered!: () => void;
    let release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    vi.doMock('node:fs/promises', async () => ({
      ...realFs,
      open: async (path: string, flags?: string | number) => {
        if (path.startsWith(join(sourceDirectory, 'same.json.')) && path.endsWith('.tmp')) {
          entered();
          await releasePromise;
        }
        return realFs.open(path, flags as never);
      },
    }));
    const { ConversationStore: RacingStore } = await import('../src/node/conversationStore');
    const store = new RacingStore(directory);
    const updated = structuredClone(original);
    updated.title = 'write after missing source lock check';
    updated.updatedAt = '2026-06-24T11:00:00.000Z';

    const writing = store.write(updated);
    await enteredPromise;
    let moveSettled = false;
    const moving = store.moveProject(project.key, { key: 'project-b', label: 'B.aep', unsaved: false });
    moving.then(
      () => { moveSettled = true; },
      () => { moveSettled = true; },
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(moveSettled).toBe(false);
    release();

    await expect(Promise.all([writing, moving])).resolves.toBeDefined();
    await expect(seed.read('project-b', 'same')).resolves.toEqual(
      expect.objectContaining({
        title: 'write after missing source lock check',
        project: { key: 'project-b', label: 'B.aep', unsaved: false },
      }),
    );
    await expect(seed.read(project.key, 'same')).rejects.toThrow();
  });

  test('removes a stale source move reservation before allowing a write', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    const document = await store.create(project, [], 'c1', now);
    const reservation = {
      owner: 'stale-owner',
      id: 'c1',
      sourceKey: project.key,
      targetKey: 'project-b',
      createdAt: '2026-06-24T08:01:00.000Z',
      stage: 'reserved',
    };
    await writeFile(join(directory, project.key, 'c1.json.move-reservation'), JSON.stringify(reservation), 'utf8');
    document.title = 'write after stale reservation';

    await expect(store.write(document)).resolves.toBeUndefined();

    await expect(readFile(join(directory, project.key, 'c1.json.move-reservation'), 'utf8')).rejects.toThrow();
    await expect(store.read(project.key, 'c1')).resolves.toEqual(expect.objectContaining({ title: 'write after stale reservation' }));
  });

  test('rolls back a stale target file whose identity still points at the source', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    const source = await store.create(project, [], 'c1', now);
    await mkdir(join(directory, 'project-b'));
    await rename(join(directory, project.key, 'c1.json'), join(directory, 'project-b', 'c1.json'));
    const reservation = {
      owner: 'stale-owner',
      id: 'c1',
      sourceKey: project.key,
      targetKey: 'project-b',
      createdAt: '2026-06-24T08:01:00.000Z',
      stage: 'renamed',
    };
    await writeFile(join(directory, 'project-b', 'c1.json.move-reservation'), JSON.stringify(reservation), 'utf8');

    await expect(store.list('project-b')).resolves.toEqual([]);
    await expect(store.read(project.key, 'c1')).resolves.toEqual(source);
    await expect(readFile(join(directory, 'project-b', 'c1.json.move-reservation'), 'utf8')).rejects.toThrow();
  });

  test('folds Unicode variants while searching conversations', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const store = new ConversationStore(directory);
    const first = await store.create(project, [], 'eszett', now);
    first.title = 'Straße';
    await store.write(first);
    const second = await store.create(project, [], 'wide', '2026-06-24T09:00:00.000Z');
    second.messages.push({ role: 'user', content: 'ＡＢＣ keyword' });
    await store.write(second);

    await expect(store.search('strasse')).resolves.toEqual([expect.objectContaining({ id: 'eszett' })]);
    await expect(store.search('abc')).resolves.toEqual([expect.objectContaining({ id: 'wide' })]);
  });

  test('wraps root list failures without exposing the full selected directory', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-conversations-'));
    const secretRoot = join(directory, 'token-abcdef123456');
    await mkdir(secretRoot);
    const realFs = await import('node:fs/promises');
    vi.doMock('node:fs/promises', async () => ({
      ...realFs,
      readdir: async (path: string, options?: unknown) => {
        if (path === secretRoot) throw Object.assign(new Error(`permission denied at ${secretRoot}`), { code: 'EACCES' });
        return realFs.readdir(path, options as never);
      },
    }));
    const { ConversationStore: FailingStore } = await import('../src/node/conversationStore');

    await expect(new FailingStore(secretRoot).list()).rejects.toThrow('EACCES');
    await expect(new FailingStore(secretRoot).list()).rejects.not.toThrow(secretRoot);
    await expect(new FailingStore(secretRoot).list()).rejects.not.toThrow('abcdef123456');
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

  test('redacts API key and token shapes from a failing Markdown filename', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-runtime-'));
    const secret = 'sk-live-1234567890';
    const missing = join(directory, `api_key=${secret}.md`);

    let message = '';
    try {
      await createRuntime().createConversation(directory, project, [missing], 'c1', now);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('无法读取 Markdown');
    expect(message).not.toContain(secret);
    expect(message).toContain('[REDACTED]');
  });

  test('redacts token-like Markdown filenames while keeping ordinary names recognizable', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-runtime-'));
    const cases = [
      { filename: 'token-abcdef123456.md', secret: 'abcdef123456' },
      { filename: 'api-key-abcdef123456.md', secret: 'abcdef123456' },
      { filename: 'notes-0123456789abcdef0123456789abcdef.md', secret: '0123456789abcdef0123456789abcdef' },
      { filename: 'clip-QWxhZGRpbjpvcGVuIHNlc2FtZQ.md', secret: 'QWxhZGRpbjpvcGVuIHNlc2FtZQ' },
    ];

    for (const item of cases) {
      let message = '';
      try {
        await createRuntime().createConversation(directory, project, [join(directory, item.filename)], 'c1', now);
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('Markdown');
      expect(message).not.toContain(item.secret);
      expect(message).toContain('[REDACTED]');
    }

    let normalMessage = '';
    try {
      await createRuntime().createConversation(directory, project, [join(directory, 'normal-project-notes.md')], 'c1', now);
    } catch (error) {
      normalMessage = (error as Error).message;
    }
    expect(normalMessage).toContain('normal-project-notes.md');
  });
});
