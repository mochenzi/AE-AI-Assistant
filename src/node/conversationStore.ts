import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import {
  createConversationDocument,
  summarizeConversation,
  type ConversationDocument,
  type ConversationSummary,
  type MarkdownSnapshot,
  type ProjectIdentity,
} from '../shared/conversationWorkspace';

type DirectoryMode = 'create' | 'existing' | 'optional';
const writeQueues = new Map<string, Promise<void>>();

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'string') return error.code;
  return '未知错误';
}

function hasCode(error: unknown, code: string): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
}

function safePathError(error: unknown): Error & { code: string } {
  const code = errorCode(error);
  return Object.assign(new Error(`不安全的会话路径：${code}`), { code });
}

function assertPathSegment(value: string, label: string): void {
  if (!value || value === '.' || value === '..' || value.includes('/') || value.includes('\\') || value.includes('\0')) {
    throw new Error(`无效的${label}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isConversationDocument(value: unknown): value is ConversationDocument {
  if (!isRecord(value) || value.version !== 1) return false;
  const project = value.project;
  const tokenUsage = value.tokenUsage;
  if (!isRecord(project)
    || typeof project.key !== 'string'
    || typeof project.label !== 'string'
    || typeof project.unsaved !== 'boolean'
    || typeof value.id !== 'string'
    || typeof value.title !== 'string'
    || !Array.isArray(value.messages)
    || !value.messages.every((message) => {
      if (!isRecord(message)
        || typeof message.role !== 'string'
        || !['system', 'user', 'assistant'].includes(message.role)
        || typeof message.content !== 'string') return false;
      if (message.usage === undefined) return true;
      return isRecord(message.usage)
        && isFiniteNumber(message.usage.input)
        && isFiniteNumber(message.usage.output)
        && (message.usage.estimated === undefined || typeof message.usage.estimated === 'boolean');
    })
    || !Array.isArray(value.markdownSnapshots)
    || !value.markdownSnapshots.every((snapshot) => isRecord(snapshot)
      && typeof snapshot.name === 'string'
      && typeof snapshot.sourcePath === 'string'
      && typeof snapshot.content === 'string')
    || !Array.isArray(value.contextProfileIds)
    || !value.contextProfileIds.every((id) => typeof id === 'string')
    || typeof value.includeActiveComposition !== 'boolean'
    || typeof value.chatMode !== 'string'
    || !['chat', 'ae'].includes(value.chatMode)
    || !isRecord(tokenUsage)
    || !isFiniteNumber(tokenUsage.input)
    || !isFiniteNumber(tokenUsage.output)
    || typeof value.archived !== 'boolean'
    || typeof value.createdAt !== 'string'
    || typeof value.updatedAt !== 'string') return false;
  if (value.modelSelection !== undefined
    && (!isRecord(value.modelSelection)
      || typeof value.modelSelection.profileId !== 'string'
      || typeof value.modelSelection.model !== 'string')) return false;
  return value.handoffSummary === undefined || typeof value.handoffSummary === 'string';
}

function isInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === '' || (!pathFromRoot.startsWith('..') && !isAbsolute(pathFromRoot));
}

async function serializeTargetWrite<T>(target: string, operation: () => Promise<T>): Promise<T> {
  const key = process.platform === 'win32' ? target.toLocaleLowerCase() : target;
  const previous = writeQueues.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => gate);
  writeQueues.set(key, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (writeQueues.get(key) === tail) writeQueues.delete(key);
  }
}

export class ConversationStore {
  private rootBoundary?: Promise<string>;

  constructor(private readonly root: string) {}

  async assertWritable(): Promise<void> {
    let probe = '';
    let created = false;
    try {
      const root = await this.safeRoot();
      probe = join(root, `.conversation-write-${process.pid}-${randomUUID()}.tmp`);
      await writeFile(probe, '', { encoding: 'utf8', flag: 'wx' });
      created = true;
      await unlink(probe);
      created = false;
    } catch (error) {
      if (created) await unlink(probe).catch(() => undefined);
      throw new Error(`会话目录不可写：${errorCode(error)}`);
    }
  }

  async create(project: ProjectIdentity, markdown: MarkdownSnapshot[], id: string, at: string): Promise<ConversationDocument> {
    const document = createConversationDocument(id, project, markdown, at);
    await this.write(document);
    return document;
  }

  async read(projectKey: string, id: string): Promise<ConversationDocument> {
    assertPathSegment(id, '会话标识');
    const directory = await this.safeProjectDirectory(projectKey, 'existing');
    if (!directory) throw new Error('无法读取会话：ENOENT');
    const document = await this.loadDocument(directory, projectKey, id, false);
    if (!document) throw new Error('无法读取会话：ENOENT');
    return document;
  }

  async write(document: ConversationDocument): Promise<void> {
    if (!isConversationDocument(document)) throw new Error('无效的会话文档');
    await this.writeDocument(document, false);
  }

  async list(projectKey?: string): Promise<ConversationSummary[]> {
    return (await this.allDocuments(projectKey))
      .map(summarizeConversation)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async search(query: string): Promise<ConversationSummary[]> {
    const needle = query.trim().toLocaleLowerCase();
    const documents = await this.allDocuments();
    const matches = needle
      ? documents.filter((document) => [
        document.title,
        document.project.label,
        ...document.messages.map((message) => message.content),
      ].some((text) => text.toLocaleLowerCase().includes(needle)))
      : documents;
    return matches.map(summarizeConversation).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
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
      for (const document of await this.documentsForProject(fromKey)) {
        await this.write({ ...document, project: { ...project } });
      }
      return;
    }

    const originals = await this.documentsForProject(fromKey);
    if (originals.length === 0) return;
    const sourceDirectory = await this.safeProjectDirectory(fromKey, 'existing');
    const targetDirectory = await this.safeProjectDirectory(project.key, 'create');
    if (!sourceDirectory || !targetDirectory) throw new Error('移动会话失败：ENOENT');

    const locks: string[] = [];
    try {
      for (const document of originals) {
        const lock = this.moveLockPath(targetDirectory, document.id);
        try {
          await writeFile(lock, randomUUID(), { encoding: 'utf8', flag: 'wx' });
          locks.push(lock);
        } catch (error) {
          if (hasCode(error, 'EEXIST')) throw new Error('移动会话冲突');
          throw error;
        }
        try {
          await lstat(join(targetDirectory, `${document.id}.json`));
          throw new Error('移动会话冲突');
        } catch (error) {
          if (!hasCode(error, 'ENOENT')) throw error;
        }
      }
    } catch (error) {
      const cleanupErrors = await this.cleanupOwnedPaths(locks);
      const cleanup = cleanupErrors.length ? `；cleanup: ${cleanupErrors.join(',')}` : '';
      if (error instanceof Error && error.message.includes('冲突')) throw new Error(`${error.message}${cleanup}`);
      throw new Error(`移动会话失败：${errorCode(error)}${cleanup}`);
    }

    const moved: ConversationDocument[] = [];
    let operationError: unknown;
    try {
      for (const document of originals) {
        const source = join(sourceDirectory, `${document.id}.json`);
        const target = join(targetDirectory, `${document.id}.json`);
        try {
          await lstat(target);
          throw new Error('移动会话冲突');
        } catch (error) {
          if (!hasCode(error, 'ENOENT')) throw error;
        }
        await rename(source, target);
        moved.push(document);
      }
      for (const document of originals) {
        await this.writeDocument({ ...document, project: { ...project } }, true);
      }
    } catch (error) {
      operationError = error;
    }

    if (operationError) {
      const rollbackErrors: string[] = [];
      for (const document of [...moved].reverse()) {
        const source = join(sourceDirectory, `${document.id}.json`);
        const target = join(targetDirectory, `${document.id}.json`);
        try {
          try {
            await lstat(source);
            throw Object.assign(new Error(), { code: 'EEXIST' });
          } catch (error) {
            if (!hasCode(error, 'ENOENT')) throw error;
          }
          await rename(target, source);
          await this.writeDocument(document, true);
        } catch (rollbackError) {
          rollbackErrors.push(errorCode(rollbackError));
        }
      }
      rollbackErrors.push(...await this.cleanupOwnedPaths(locks));
      const rollback = rollbackErrors.length ? `；rollback: ${rollbackErrors.join(',')}` : '';
      throw new Error(`移动会话失败：${errorCode(operationError)}${rollback}`);
    }

    const cleanupErrors = await this.cleanupOwnedPaths(locks);
    if (cleanupErrors.length) throw new Error(`移动会话已完成，但 cleanup 失败：${cleanupErrors.join(',')}`);
  }

  private async safeRoot(): Promise<string> {
    if (!this.rootBoundary) {
      this.rootBoundary = (async () => {
        try {
          const resolved = await realpath(this.root);
          const info = await lstat(resolved);
          if (!info.isDirectory()) throw Object.assign(new Error(), { code: 'ENOTDIR' });
          return resolved;
        } catch (error) {
          throw safePathError(error);
        }
      })();
    }
    return this.rootBoundary;
  }

  private async safeProjectDirectory(projectKey: string, mode: DirectoryMode): Promise<string | undefined> {
    assertPathSegment(projectKey, '项目标识');
    const root = await this.safeRoot();
    const candidate = join(root, projectKey);
    let info;
    try {
      info = await lstat(candidate);
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) throw safePathError(error);
      if (mode === 'optional') return undefined;
      if (mode === 'existing') throw safePathError(error);
      try {
        await mkdir(candidate);
      } catch (mkdirError) {
        if (!hasCode(mkdirError, 'EEXIST')) throw safePathError(mkdirError);
      }
      try {
        info = await lstat(candidate);
      } catch (verifyError) {
        throw safePathError(verifyError);
      }
    }
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error('不安全的会话路径');
    let resolved: string;
    try {
      resolved = await realpath(candidate);
    } catch (error) {
      throw safePathError(error);
    }
    if (!isInside(root, resolved)) throw new Error('不安全的会话路径');
    let verified;
    try {
      verified = await lstat(candidate);
    } catch (error) {
      throw safePathError(error);
    }
    if (verified.isSymbolicLink() || !verified.isDirectory()) throw new Error('不安全的会话路径');
    return resolved;
  }

  private async writeDocument(document: ConversationDocument, ignoreMoveLock: boolean): Promise<void> {
    assertPathSegment(document.id, '会话标识');
    const directory = await this.safeProjectDirectory(document.project.key, 'create');
    if (!directory) throw new Error('无法写入会话：ENOENT');
    const target = join(directory, `${document.id}.json`);
    if (!ignoreMoveLock) {
      try {
        await lstat(this.moveLockPath(directory, document.id));
        throw new Error('无法写入会话：移动中');
      } catch (error) {
        if (!hasCode(error, 'ENOENT')) throw error;
      }
    }
    await serializeTargetWrite(target, async () => {
      const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
      let handle: Awaited<ReturnType<typeof open>> | undefined;
      let created = false;
      try {
        handle = await open(temporary, 'wx');
        created = true;
        await handle.writeFile(JSON.stringify(document, null, 2), 'utf8');
        await handle.close();
        handle = undefined;
        await rename(temporary, target);
        created = false;
        await this.safeProjectDirectory(document.project.key, 'existing');
      } catch (error) {
        await handle?.close().catch(() => undefined);
        if (created) await unlink(temporary).catch(() => undefined);
        if (error instanceof Error && error.message.includes('无法写入会话')) throw error;
        throw new Error(`无法写入会话：${errorCode(error)}`);
      }
    });
  }

  private async allDocuments(projectKey?: string): Promise<ConversationDocument[]> {
    const keys = projectKey ? [projectKey] : await this.projectKeys();
    const documents: ConversationDocument[] = [];
    for (const key of keys) documents.push(...await this.documentsForProject(key));
    return documents;
  }

  private async projectKeys(): Promise<string[]> {
    const root = await this.safeRoot();
    const entries = await readdir(root, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => entry.name);
  }

  private async documentsForProject(projectKey: string): Promise<ConversationDocument[]> {
    const directory = await this.safeProjectDirectory(projectKey, 'optional');
    if (!directory) return [];
    let names: string[];
    try {
      names = (await readdir(directory)).filter((name) => name.endsWith('.json'));
      await this.safeProjectDirectory(projectKey, 'existing');
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return [];
      throw new Error(`无法列出会话：${errorCode(error)}`);
    }
    const documents: ConversationDocument[] = [];
    for (const name of names) {
      const id = name.slice(0, -'.json'.length);
      const document = await this.loadDocument(directory, projectKey, id, true);
      if (document) documents.push(document);
    }
    return documents;
  }

  private async loadDocument(directory: string, projectKey: string, id: string, missingIsEmpty: boolean): Promise<ConversationDocument | undefined> {
    const path = join(directory, `${id}.json`);
    let raw: string;
    try {
      raw = await readFile(path, 'utf8');
      await this.safeProjectDirectory(projectKey, 'existing');
    } catch (error) {
      if (missingIsEmpty && hasCode(error, 'ENOENT')) return undefined;
      throw new Error(`无法读取会话：${errorCode(error)}`);
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      await this.quarantine(path);
      if (missingIsEmpty) return undefined;
      throw new Error('会话文件损坏');
    }
    if (!isConversationDocument(value) || value.project.key !== projectKey || value.id !== id) {
      await this.quarantine(path);
      if (missingIsEmpty) return undefined;
      throw new Error('会话文件损坏');
    }
    return value;
  }

  private async quarantine(path: string): Promise<void> {
    const target = `${path}.${randomUUID()}.corrupt`;
    let reserved = false;
    try {
      await writeFile(target, '', { encoding: 'utf8', flag: 'wx' });
      reserved = true;
      await rename(path, target);
      reserved = false;
    } catch (error) {
      if (reserved) await unlink(target).catch(() => undefined);
      if (hasCode(error, 'ENOENT')) return;
      throw new Error(`无法隔离损坏会话：${errorCode(error)}`);
    }
  }

  private moveLockPath(directory: string, id: string): string {
    return join(directory, `${id}.json.move-reservation`);
  }

  private async cleanupOwnedPaths(paths: string[]): Promise<string[]> {
    const errors: string[] = [];
    for (const path of paths) {
      try {
        await unlink(path);
      } catch (error) {
        if (!hasCode(error, 'ENOENT')) errors.push(errorCode(error));
      }
    }
    return errors;
  }
}
