export interface ScriptMenuMarkdownSnapshot {
  name: string;
  sourcePath: string;
  content: string;
}

export interface ScriptMenuItem {
  index: number;
  name: string;
  path: string;
}

const scriptExtension = /\.(jsxbin|jsx|js)$/i;

function cleanPath(value: string): string {
  return value.trim().replace(/^["'`]+|["'`]+$/g, '');
}

function cleanName(value: string, fallback: string): string {
  return value
    .replace(/^[-*\d.\s]+/, '')
    .replace(/[\s:\uFF1A\-\u2013\u2014]+$/, '')
    .trim() || fallback;
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function parseScriptMenuMarkdown(markdown: string): ScriptMenuItem[] {
  const items: ScriptMenuItem[] = [];
  const seen = new Set<string>();
  const add = (name: string, path: string) => {
    const normalized = cleanPath(path);
    if (!scriptExtension.test(normalized) || seen.has(normalized.toLocaleLowerCase())) return;
    seen.add(normalized.toLocaleLowerCase());
    items.push({ index: items.length + 1, name: cleanName(name, basename(normalized)), path: normalized });
  };

  for (const line of markdown.split(/\r?\n/)) {
    const link = line.match(/\[([^\]]+)]\(([^)]+?\.(?:jsxbin|jsx|js))\)/i);
    if (link) {
      add(link[1], link[2]);
      continue;
    }
    const path = line.match(/((?:[A-Za-z]:[\\/]|\\\\)[^\r\n|<>?*"]+?\.(?:jsxbin|jsx|js))/i);
    if (path) {
      add(line.slice(0, path.index).replace(/[\s:\uFF1A\-\u2013\u2014]*$/, ''), path[1]);
    }
  }

  return items;
}

export function parseScriptMenuSnapshots(snapshots: ScriptMenuMarkdownSnapshot[]): ScriptMenuItem[] {
  return parseScriptMenuMarkdown(snapshots.map((snapshot) => snapshot.content).join('\n'));
}

export function formatScriptMenuPrompt(items: ScriptMenuItem[]): string {
  if (!items.length) {
    return '\u6ca1\u6709\u5728\u5f53\u524d\u5bf9\u8bdd\u9009\u62e9\u7684 Markdown '
      + '\u4e2d\u627e\u5230\u53ef\u542f\u52a8\u811a\u672c\u3002'
      + '\u8bf7\u5728\u65b0\u5bf9\u8bdd\u91cc\u9009\u62e9\u5305\u542b .jsx\u3001.jsxbin '
      + '\u6216 .js \u8def\u5f84\u7684 MD\u3002';
  }
  return '\u68c0\u6d4b\u5230\u4ee5\u4e0b\u811a\u672c\uff1a\n'
    + items.map((item) => `${item.index}. ${item.name}`).join('\n')
    + '\n\u8bf7\u9009\u62e9\u8981\u542f\u52a8\u54ea\u4e00\u4e2a\u811a\u672c\uff0c'
    + '\u76f4\u63a5\u8f93\u5165\u6570\u5b57\u5373\u53ef\u3002';
}

export function resolveScriptMenuChoice(items: ScriptMenuItem[], input: string): ScriptMenuItem | null {
  const match = input.trim().match(/^\d+$/);
  if (!match) return null;
  const index = Number(match[0]);
  return items.find((item) => item.index === index) ?? null;
}
