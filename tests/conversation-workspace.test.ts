import { describe, expect, test } from 'vitest';
import {
  createConversationDocument,
  projectIdentity,
  summarizeConversation,
  titleFromPrompt,
} from '../src/shared/conversationWorkspace';

describe('conversation workspace', () => {
  test('uses a stable saved-project key', () => {
    const first = projectIdentity('D:\\ae\\intro.aep', 'intro.aep');
    const same = projectIdentity('d:/ae/intro.aep', 'intro.aep');
    const other = projectIdentity('D:\\ae\\other.aep', 'other.aep');

    expect(first).toEqual(same);
    expect(first.key).not.toBe(other.key);
    expect(first).toMatchObject({ label: 'intro.aep', unsaved: false });
  });

  test('keeps unsaved projects in an explicit group', () => {
    expect(projectIdentity('', '未保存工程')).toEqual({
      key: 'unsaved',
      label: '未保存工程',
      unsaved: true,
    });
  });

  test('creates an isolated document with Markdown snapshots', () => {
    const markdownSnapshots = [
      { name: '规范.md', sourcePath: 'D:/docs/规范.md', content: '# 规范' },
    ];
    const document = createConversationDocument(
      'c1',
      { key: 'project', label: 'intro.aep', unsaved: false },
      markdownSnapshots,
      '2026-06-24T00:00:00.000Z',
    );

    markdownSnapshots[0].content = '# changed outside';
    expect(document.messages).toEqual([]);
    expect(document.markdownSnapshots[0].content).toBe('# 规范');
    expect(document.includeActiveComposition).toBe(false);
  });

  test('derives a concise local title from the first message', () => {
    expect(titleFromPrompt('  帮我把当前合成里的圆形做成弹性动画  ')).toBe(
      '帮我把当前合成里的圆形做成弹性动画',
    );
    expect(titleFromPrompt(' '.repeat(3))).toBe('新对话');
  });

  test('summarizes only list metadata', () => {
    const document = createConversationDocument(
      'c1',
      { key: 'project', label: 'intro.aep', unsaved: false },
      [],
      '2026-06-24T00:00:00.000Z',
    );
    document.title = 'Local title';

    expect(summarizeConversation(document)).toEqual({
      id: 'c1',
      project: document.project,
      title: 'Local title',
      createdAt: document.createdAt,
      updatedAt: document.updatedAt,
    });
  });
});
