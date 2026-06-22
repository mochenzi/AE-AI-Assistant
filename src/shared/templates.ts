export function renderTemplate(body: string, values: Record<string, string>): string {
  return body.replace(/{{\s*([\w.-]+)\s*}}/g, (_, key: string) => {
    if (!(key in values) || values[key] === '') throw new Error(`缺少模板变量：${key}`);
    return values[key];
  });
}

export function extractTemplateVariables(body: string): string[] {
  return [...new Set([...body.matchAll(/{{\s*([\w.-]+)\s*}}/g)].map((match) => match[1]))];
}
