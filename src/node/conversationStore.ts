import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createConversationDocument,
  summarizeConversation,
  type ConversationDocument,
  type ConversationSummary,
  type MarkdownSnapshot,
  type ProjectIdentity,
} from '../shared/conversationWorkspace';

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return '未知错误';
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

function isAlreadyExists(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'EEXIST');
}

function isConversationDocument(value: unknown): value is ConversationDocument {
  if (!value || typeof value !== 'object') return false;
  const document = value as Partial<ConversationDocument>;
  return document.version === 1
    && typeof document.id === 'string'
    && Boolean(document.project && typeof document.project.key === 'string')
    && typeof document.title === 'string'
    && Array.isArray(document.messages)
    && Array.isArray(document.markdownSnapshots)
    && typeof document.createdAt === 'string'
    && typeof document.updatedAt === 'string';
}

function assertPathSegment(value: string, label: string): void {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\') || value.includes('\0')) {
    throw new Error(`无效的${label}`);
  }
}

export class ConversationStore {
  constructor(private readonly root: string) {}

  async assertWritable(): Promise<void> {
    const probe = join(this.root, `.conversation-write-${process.pid}-${Date.now()}.tmp`);
    try {
      const rootStat = await stat(this.root);
      if (!rootStat.isDirectory()) throw Object.assign(new Error(), { code: 'ENOTDIR' });
      await writeFile(probe, '', { encoding: 'utf8', flag: 'wx' });
      await unlink(probe);
    } catch (error) {
      await unlink(probe).catch(() => undefined);
      throw new Error(`会话目录不可写：${errorCode(error)}`);
    }
  }

  async create(project: ProjectIdentity, markdown: MarkdownSnapshot[], id: string, at: string): Promise<ConversationDocument> {
    const document = createConversationDocument(id, project, markdown, at);
    await this.write(document);
    return document;
  }

  async read(projectKey: string, id: string): Promise<ConversationDocument> {
    const path = this.documentPath(projectKey, id);
    try {
      const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (!isConversationDocument(parsed)) throw new Error('invalid document');
      return parsed;
    } catch (error) {
      throw new Error(`无法读取会话：${errorCode(error)}`);
    }
  }

  async write(document: ConversationDocument): Promise<void> {
    await this.assertWritable();
    const projectDirectory = join(this.root, document.project.key);
    const target = this.documentPath(document.project.key, document.id);
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      await mkdir(projectDirectory, { recursive: true });
      await writeFile(temporary, JSON.stringify(document, null, 2), { encoding: 'utf8', flag: 'wx' });
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw new Error(`无法写入会话：${errorCode(error)}`);
    }
  }

  async list(projectKey?: string): Promise<ConversationSummary[]> {
    const keys = projectKey ? [projectKey] : await this.projectKeys();
    const documents: ConversationDocument[] = [];
    for (const key of keys) documents.push(...await this.documentsForProject(key));
    return documents
      .map(summarizeConversation)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async search(query: string): Promise<ConversationSummary[]> {
    const needle = query.trim().toLocaleLowerCase();
    const summaries = await this.list();
    if (!needle) return summaries;
    return summaries.filter((summary) => `${summary.title}\n${summary.project.label}`.toLocaleLowerCase().includes(needle));
  }

  async rename(projectKey: string, id: string, title: string): Promise<ConversationDocument> {
    const document = await this.read(projectKey, id);
    document.title = title;
    document.updatedAt = new Date().toISOString();
    await this.write(document);
    return document;
  }

  async moveProject(fromKey: string, project: ProjectIdentity): Promise<void> {
    assertPathSegment(fromKey, '项目标识');
    assertPathSegment(project.key, '项目标识');
    if (fromKey === project.key) {
      const documents = await this.documentsForProject(fromKey);
      for (const document of documents) {
        document.project = { ...project };
        await this.write(document);
      }
      return;
    }

    const originals = await this.documentsForProject(fromKey);
    if (originals.length === 0) return;
    await this.assertWritable();
    await mkdir(join(this.root, project.key), { recursive: true });

    const reservations: string[] = [];
    for (const document of originals) {
      const target = this.documentPath(project.key, document.id);
      try {
        const reservedDocument = { ...document, project: { ...project } };
        await writeFile(target, JSON.stringify(reservedDocument, null, 2), { encoding: 'utf8', flag: 'wx' });
        reservations.push(target);
      } catch (error) {
        for (const reservation of reservations) await unlink(reservation).catch(() => undefined);
        if (isAlreadyExists(error)) throw new Error(`移动会话冲突：${document.id}`);
        throw new Error(`移动会话失败：${errorCode(error)}`);
      }
    }

    const moved: ConversationDocument[] = [];
    try {
      for (const document of originals) {
        const target = this.documentPath(project.key, document.id);
        await rename(this.documentPath(fromKey, document.id), target);
        moved.push(document);
        reservations.splice(reservations.indexOf(target), 1);
      }
      for (const document of originals) {
        await this.write({ ...document, project: { ...project } });
      }
    } catch (error) {
      const rollbackErrors: string[] = [];
      for (const reservation of reservations) {
        try {
          await unlink(reservation);
        } catch (rollbackError) {
          rollbackErrors.push(errorCode(rollbackError));
        }
      }
      for (const document of [...moved].reverse()) {
        try {
          await rename(this.documentPath(project.key, document.id), this.documentPath(fromKey, document.id));
          await this.write(document);
        } catch (rollbackError) {
          rollbackErrors.push(errorCode(rollbackError));
        }
      }
      const rollback = rollbackErrors.length ? `，回滚异常：${rollbackErrors.join(',')}` : '';
      throw new Error(`移动会话失败：${errorCode(error)}${rollback}`);
    }
  }

  private documentPath(projectKey: string, id: string): string {
    assertPathSegment(projectKey, '项目标识');
    assertPathSegment(id, '会话标识');
    return join(this.root, projectKey, `${id}.json`);
  }

  private async projectKeys(): Promise<string[]> {
    try {
      const entries = await readdir(this.root, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      if (isMissing(error)) return [];
      throw new Error(`无法列出会话：${errorCode(error)}`);
    }
  }

  private async documentsForProject(projectKey: string): Promise<ConversationDocument[]> {
    assertPathSegment(projectKey, '项目标识');
    const directory = join(this.root, projectKey);
    let names: string[];
    try {
      names = (await readdir(directory)).filter((name) => name.endsWith('.json'));
    } catch (error) {
      if (isMissing(error)) return [];
      throw new Error(`无法列出会话：${errorCode(error)}`);
    }

    const documents: ConversationDocument[] = [];
    for (const name of names) {
      const path = join(directory, name);
      try {
        const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
        if (!isConversationDocument(parsed)) throw new Error('invalid document');
        documents.push(parsed);
      } catch {
        await this.quarantine(path);
      }
    }
    return documents;
  }

  private async quarantine(path: string): Promise<void> {
    let target = `${path}.corrupt`;
    for (let suffix = 2; ; suffix += 1) {
      try {
        await stat(target);
        target = `${path}.corrupt.${suffix}`;
      } catch (error) {
        if (isMissing(error)) break;
        throw new Error(`无法隔离损坏会话：${errorCode(error)}`);
      }
    }
    try {
      await rename(path, target);
    } catch (error) {
      throw new Error(`无法隔离损坏会话：${errorCode(error)}`);
    }
  }
}
