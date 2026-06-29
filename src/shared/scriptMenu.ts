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
  return value.replace(/^[-*\d.\s]+/, '').replace(/[:：\-—–]\s*$/, '').trim() || fallback;
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
    if (path) add(line.slice(0, path.index).replace(/[:：\-—–]\s*$/, ''), path[1]);
  }

  return items;
}

export function formatScriptMenuPrompt(items: ScriptMenuItem[]): string {
  if (!items.length) return '没有在 Markdown 中找到可启动脚本。请使用 .jsx、.jsxbin 或 .js 路径。';
  return `检测到以下脚本：\n${items.map((item) => `${item.index}. ${item.name}`).join('\n')}\n请输入数字启动脚本。`;
}

export function resolveScriptMenuChoice(items: ScriptMenuItem[], input: string): ScriptMenuItem | null {
  const match = input.trim().match(/^\d+$/);
  if (!match) return null;
  const index = Number(match[0]);
  return items.find((item) => item.index === index) ?? null;
}
