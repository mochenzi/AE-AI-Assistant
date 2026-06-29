import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  createConversationDocument,
  type ConversationDocument,
  type ProjectIdentity,
} from '../src/shared/conversationWorkspace';

function installPreviewWindow() {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
  });
  vi.stubGlobal('window', { localStorage: globalThis.localStorage });
}

describe('CEP bridge', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  test('normalizes multiple Markdown selections', async () => {
    const { normalizeCepFileSelection } = await import('../src/cep/bridge');

    expect(normalizeCepFileSelection({ err: 0, data: ['file:///D:/docs/a.md', 'D:\\docs\\b.md'] })).toEqual([
      'D:/docs/a.md',
      'D:\\docs\\b.md',
    ]);
  });

  test('returns an empty list when selection is cancelled', async () => {
    const { normalizeCepFileSelection } = await import('../src/cep/bridge');

    expect(normalizeCepFileSelection({ err: 1 })).toEqual([]);
  });

  test('selects multiple Markdown files from CEP and normalizes cancellation', async () => {
    const showOpenDialog = vi.fn()
      .mockReturnValueOnce({ err: 0, data: ['file:///D:/docs/a.md', 'file:///D:/docs/b.md'] })
      .mockReturnValueOnce({ err: 1 });
    vi.stubGlobal('window', { cep: { fs: { showOpenDialog } } });
    const { selectCepMarkdownFiles } = await import('../src/cep/bridge');

    expect(selectCepMarkdownFiles()).toEqual(['D:/docs/a.md', 'D:/docs/b.md']);
    expect(selectCepMarkdownFiles()).toEqual([]);
    expect(showOpenDialog).toHaveBeenCalledWith(true, false, expect.any(String), '', ['md']);
  });

  test('preview runtime persists conversation documents in localStorage', async () => {
    installPreviewWindow();
    const { getRuntime } = await import('../src/cep/bridge');
    const runtime = getRuntime();
    const project: ProjectIdentity = { key: 'project-a', label: 'intro.aep', unsaved: false };
    const created = await runtime.createConversation(
      'ignored-preview-root',
      project,
      ['D:/brand.md'],
      'c1',
      '2026-06-24T08:00:00.000Z',
    );

    expect(created).toMatchObject({
      id: 'c1',
      project,
      markdownSnapshots: [{ name: 'brand.md', sourcePath: 'D:/brand.md', content: '' }],
    });
    await expect(runtime.readConversation('ignored-preview-root', project.key, 'c1')).resolves.toEqual(created);

    created.title = 'Updated';
    await runtime.writeConversation('ignored-preview-root', created);

    await expect(runtime.listConversations('ignored-preview-root', project.key)).resolves.toEqual([
      expect.objectContaining({ id: 'c1', title: 'Updated' }),
    ]);
    await expect(runtime.searchConversations('ignored-preview-root', 'Updated')).resolves.toEqual([
      expect.objectContaining({ id: 'c1', title: 'Updated' }),
    ]);
  });

  test('preview runtime renames and moves localStorage conversations', async () => {
    installPreviewWindow();
    const { getRuntime } = await import('../src/cep/bridge');
    const runtime = getRuntime();
    const project: ProjectIdentity = { key: 'project-a', label: 'intro.aep', unsaved: false };
    const movedProject: ProjectIdentity = { key: 'project-b', label: 'other.aep', unsaved: false };
    const document: ConversationDocument = createConversationDocument('c1', project, [], '2026-06-24T08:00:00.000Z');
    await runtime.writeConversation('ignored-preview-root', document);

    await expect(runtime.renameConversation('ignored-preview-root', project.key, document.id, 'Renamed')).resolves.toMatchObject({
      title: 'Renamed',
    });
    await runtime.moveConversationProject('ignored-preview-root', project.key, movedProject);

    await expect(runtime.readConversation('ignored-preview-root', movedProject.key, document.id)).resolves.toMatchObject({
      id: document.id,
      project: movedProject,
      title: 'Renamed',
    });
    await expect(runtime.listConversations('ignored-preview-root', project.key)).resolves.toEqual([]);
  });
});
