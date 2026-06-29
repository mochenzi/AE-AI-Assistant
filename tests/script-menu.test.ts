import { describe, expect, test } from 'vitest';
import { formatScriptMenuPrompt, parseScriptMenuMarkdown, resolveScriptMenuChoice } from '../src/shared/scriptMenu';

describe('script menu markdown', () => {
  test('parses numbered script paths and markdown links', () => {
    const items = parseScriptMenuMarkdown(`
1. 创建片头 - D:/AE/scripts/intro.jsx
- [清理空图层](D:/AE/scripts/clean.jsxbin)
- 普通说明 D:/AE/scripts/readme.md
2. 相对路径 ./ignore.jsx
3. 批量替换：C:\\AE\\replace.js
`);

    expect(items).toEqual([
      { index: 1, name: '创建片头', path: 'D:/AE/scripts/intro.jsx' },
      { index: 2, name: '清理空图层', path: 'D:/AE/scripts/clean.jsxbin' },
      { index: 3, name: '批量替换', path: 'C:\\AE\\replace.js' },
    ]);
  });

  test('formats and resolves numeric choices only', () => {
    const items = parseScriptMenuMarkdown('1. 创建片头 - D:/AE/scripts/intro.jsx');

    expect(formatScriptMenuPrompt(items)).toContain('1. 创建片头');
    expect(resolveScriptMenuChoice(items, '1')).toEqual(items[0]);
    expect(resolveScriptMenuChoice(items, '启动 1')).toBeNull();
    expect(resolveScriptMenuChoice(items, '2')).toBeNull();
  });
});
