import { afterEach, describe, expect, test } from 'vitest';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  compactArchivedConversation,
  createArchiveFilename,
  persistArchiveTransition,
  serializeConversation,
} from '../src/shared/conversationArchive';
import { writeConversationArchive } from '../src/node/cepRuntime';

const conversation = {
  id: 'conversation-1',
  title: '项目片头',
  messages: [
    { role: 'user' as const, content: '创建一个片头' },
    { role: 'assistant' as const, content: '已生成动作计划', usage: { input: 18, output: 9 } },
  ],
  contextProfileIds: ['context-1'],
  archived: false,
  createdAt: '2026-06-23T03:04:05.000Z',
};

const contexts = [{
  id: 'context-1',
  name: '品牌规范',
  content: '主色为蓝色。',
  updatedAt: '2026-06-22T00:00:00.000Z',
}];

describe('conversation Markdown archives', () => {
  let directory = '';

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  test('serializes metadata, selected contexts, messages, and token usage', () => {
    const markdown = serializeConversation(conversation, contexts);

    expect(markdown).toContain('# 项目片头');
    expect(markdown).toContain('## 已启用的上下文');
    expect(markdown).toContain('### 品牌规范');
    expect(markdown).toContain('主色为蓝色。');
    expect(markdown).toContain('## 对话记录');
    expect(markdown).toContain('### 用户');
    expect(markdown).toContain('创建一个片头');
    expect(markdown).toContain('输入 18 / 输出 9 tokens');
  });

  test('creates a Windows-safe Markdown filename without path traversal', () => {
    const filename = createArchiveFilename('项目:片头/第一版*?', '2026-06-23T03:04:05.000Z', 'conversation-1');

    expect(filename).toMatch(/^2026-06-23_110405_项目_片头_第一版__-conversation-1\.md$/);
    expect(filename).not.toContain('/');
    expect(filename).not.toContain(':');
  });

  test('compacts a conversation only after receiving its archive path', () => {
    const compacted = compactArchivedConversation(conversation, 'D:/AI/archive.md', '后续继续优化片头。');

    expect(compacted.messages).toEqual([]);
    expect(compacted.archived).toBe(true);
    expect(compacted.archivePath).toBe('D:/AI/archive.md');
    expect(compacted.handoffSummary).toBe('后续继续优化片头。');
  });

  test('commits compacted state only after persistent storage succeeds', async () => {
    const events: string[] = [];
    const nextState = { conversations: ['compacted'] };

    await persistArchiveTransition(
      async (value) => { expect(value).toBe(nextState); events.push('saved'); },
      nextState,
      () => events.push('committed'),
    );

    expect(events).toEqual(['saved', 'committed']);
  });

  test('does not commit compacted state when persistent storage fails', async () => {
    let committed = false;

    await expect(persistArchiveTransition(
      async () => { throw new Error('disk full'); },
      { conversations: ['compacted'] },
      () => { committed = true; },
    )).rejects.toThrow('disk full');

    expect(committed).toBe(false);
  });

  test('atomically writes the archive into an existing external directory', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-archive-'));

    const archivePath = await writeConversationArchive(directory, conversation, contexts);

    expect(await readFile(archivePath, 'utf8')).toBe(serializeConversation(conversation, contexts));
    expect((await readdir(directory)).some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  test('adds a suffix instead of replacing an existing archive', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-archive-'));

    const first = await writeConversationArchive(directory, conversation, contexts);
    const second = await writeConversationArchive(directory, conversation, contexts);

    expect(second).not.toBe(first);
    expect(second).toMatch(/-2\.md$/);
    expect(await readFile(first, 'utf8')).toBe(serializeConversation(conversation, contexts));
    expect(await readFile(second, 'utf8')).toBe(serializeConversation(conversation, contexts));
  });

  test('rejects an invalid directory without writing or compacting state', async () => {
    directory = await mkdtemp(join(tmpdir(), 'ae-ai-archive-'));
    const missing = join(directory, 'missing');

    await expect(writeConversationArchive(missing, conversation, contexts)).rejects.toThrow('归档目录');
    expect(conversation.messages).toHaveLength(2);
  });
});
