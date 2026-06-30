import { createDefaultState, type AppState, type Conversation } from '../shared/appState';
import type { AeActionPlan } from '../shared/actionProtocol';
import type { ApiProfile, ChatMessage, ContextProfile } from '../shared/types';
import {
  createConversationDocument,
  summarizeConversation,
  type ConversationDocument,
  type ConversationSummary,
  type ProjectIdentity,
} from '../shared/conversationWorkspace';
import type { CompositionSnapshot } from '../shared/compositionSnapshot';
import { parseScriptMenuMarkdown, type ScriptMenuItem } from '../shared/scriptMenu';

declare global {
  interface Window {
    __adobe_cep__?: { evalScript(script: string, callback: (result: string) => void): void; getSystemPath(name: string): string };
    cep_node?: { require(id: string): any };
    cep?: { fs?: { showOpenDialog(allowMultipleSelection: boolean, chooseDirectory: boolean, title: string, initialPath?: string, fileTypes?: string[]): { err: number; data?: string[] } } };
  }
}

export interface ProjectContext {
  projectName: string;
  projectPath: string;
  revision: string;
  activeComp: null | { id: number; name: string; width: number; height: number; duration: number; frameRate: number; layerCount: number };
  selectedLayers: Array<{ id: number; name: string; type: string; inPoint: number; outPoint: number }>;
}

const fallbackProject: ProjectContext = {
  projectName: '开发预览工程.aep',
  projectPath: '',
  revision: 'preview|1|3|',
  activeComp: { id: 1, name: 'Main', width: 1920, height: 1080, duration: 10, frameRate: 25, layerCount: 2 },
  selectedLayers: [],
};

export const fallbackCompositionSnapshot: CompositionSnapshot = {
  version: 'ae-composition-context/v1',
  projectRevision: fallbackProject.revision,
  composition: {
    id: 1,
    name: 'Main',
    width: 1920,
    height: 1080,
    pixelAspect: 1,
    duration: 10,
    frameRate: 25,
    workAreaStart: 0,
    workAreaDuration: 10,
    time: 0,
  },
  layers: [
    {
      index: 1,
      name: '标题',
      type: 'ADBE Text Layer',
      selected: true,
      enabled: true,
      locked: false,
      parentIndex: null,
      startTime: 0,
      inPoint: 0,
      outPoint: 10,
      sourceText: '你好，AE AI Assistant',
      properties: [],
      effects: [],
      unavailable: [],
    },
    {
      index: 2,
      name: '背景',
      type: 'ADBE AV Layer',
      selected: false,
      enabled: true,
      locked: false,
      parentIndex: null,
      startTime: 0,
      inPoint: 0,
      outPoint: 10,
      properties: [],
      effects: [],
      unavailable: [],
    },
  ],
  unavailable: [],
};

function parseHost<T>(raw: string): T {
  const result = JSON.parse(raw) as { ok: boolean; value?: T; error?: string };
  if (!result.ok) throw new Error(result.error || 'AE 执行失败');
  return result.value as T;
}

export const hostBridge = {
  isCep: () => Boolean(window.__adobe_cep__),
  getProjectContext: (): Promise<ProjectContext> => !window.__adobe_cep__ ? Promise.resolve(fallbackProject) : new Promise((resolve, reject) => window.__adobe_cep__!.evalScript('AEAI.getProjectContext()', (raw) => { try { resolve(parseHost<ProjectContext>(raw)); } catch (error) { reject(error); } })),
  getActiveCompositionSnapshot: (): Promise<CompositionSnapshot> => !window.__adobe_cep__ ? Promise.resolve(fallbackCompositionSnapshot) : new Promise((resolve, reject) => window.__adobe_cep__!.evalScript('AEAI.getActiveCompositionSnapshot()', (raw) => { try { resolve(parseHost<CompositionSnapshot>(raw)); } catch (error) { reject(error); } })),
  executePlan: (plan: AeActionPlan): Promise<unknown> => !window.__adobe_cep__ ? Promise.resolve({ preview: true }) : new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(JSON.stringify(plan)).replace(/'/g, '%27');
    window.__adobe_cep__!.evalScript(`AEAI.executePlan('${encoded}')`, (raw) => { try { resolve(parseHost(raw)); } catch (error) { reject(error); } });
  }),
  executeScript: (path: string): Promise<unknown> => !window.__adobe_cep__ ? Promise.resolve({ preview: true, path }) : new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(path).replace(/'/g, '%27');
    window.__adobe_cep__!.evalScript(`AEAI.executeScript('${encoded}')`, (raw) => { try { resolve(parseHost(raw)); } catch (error) { reject(error); } });
  }),
};

export interface RuntimeBridge {
  getState(): Promise<AppState>;
  saveState(value: AppState): Promise<void>;
  saveApiKey(profileId: string, key: string): Promise<void>;
  hasApiKey(profileId: string): Promise<boolean>;
  removeApiKey(profileId: string): Promise<void>;
  testProfile(profile: ApiProfile): Promise<{ ok: boolean; modelCount: number }>;
  listModels(profile: ApiProfile): Promise<Array<{ id: string; contextWindow?: number }>>;
  getBalance(profile: ApiProfile): Promise<{ amount: number; currency?: string } | null>;
  chat(profile: ApiProfile, messages: Array<Pick<ChatMessage, 'role' | 'content'>>, onEvent?: (event: any) => void): Promise<any[]>;
  generateImage(profile: ApiProfile, prompt: string, size: string, outputDirectory: string): Promise<string>;
  submitVideo(profile: ApiProfile, prompt: string, ratio: string, duration: number): Promise<string>;
  pollVideo(profile: ApiProfile, taskId: string): Promise<{ state: 'polling' | 'ready' | 'failed'; url?: string; error?: string }>;
  download(url: string, outputDirectory: string): Promise<string>;
  archiveConversation(directory: string, conversation: Conversation, contexts: ContextProfile[]): Promise<string>;
  assertConversationDirectory(directory: string): Promise<void>;
  createConversation(directory: string, project: ProjectIdentity, markdownPaths: string[], id: string, at: string): Promise<ConversationDocument>;
  readConversation(directory: string, projectKey: string, id: string): Promise<ConversationDocument>;
  writeConversation(directory: string, document: ConversationDocument): Promise<void>;
  listConversations(directory: string, projectKey?: string): Promise<ConversationSummary[]>;
  searchConversations(directory: string, query: string): Promise<ConversationSummary[]>;
  renameConversation(directory: string, projectKey: string, id: string, title: string): Promise<ConversationDocument>;
  deleteConversation(directory: string, projectKey: string, id: string): Promise<void>;
  moveConversationProject(directory: string, fromKey: string, project: ProjectIdentity): Promise<void>;
  loadScriptMenu(markdownPath: string): Promise<ScriptMenuItem[]>;
}

class PreviewRuntime implements RuntimeBridge {
  private state = createDefaultState();
  private readonly conversationStorageKey = 'ae-ai-preview-conversations';

  async getState() { const saved = localStorage.getItem('ae-ai-preview'); return saved ? JSON.parse(saved) : this.state; }
  async saveState(value: AppState) { this.state = value; localStorage.setItem('ae-ai-preview', JSON.stringify(value)); }
  async saveApiKey() { return; }
  async hasApiKey() { return false; }
  async removeApiKey() { return; }
  async archiveConversation(): Promise<string> { throw new Error('开发预览模式不能写入外部归档目录'); }
  async assertConversationDirectory() { return; }
  async createConversation(_directory: string, project: ProjectIdentity, markdownPaths: string[], id: string, at: string): Promise<ConversationDocument> {
    const document = createConversationDocument(
      id,
      project,
      markdownPaths.map((path) => ({ name: previewBasename(path), sourcePath: path, content: '' })),
      at,
    );
    await this.writeConversation(_directory, document);
    return document;
  }
  async readConversation(_directory: string, projectKey: string, id: string): Promise<ConversationDocument> {
    const document = this.previewDocuments().find((candidate) => candidate.project.key === projectKey && candidate.id === id);
    if (!document) throw new Error('预览会话不存在');
    return structuredClone(document);
  }
  async writeConversation(_directory: string, document: ConversationDocument): Promise<void> {
    const documents = this.previewDocuments().filter((candidate) => candidate.project.key !== document.project.key || candidate.id !== document.id);
    documents.push(structuredClone(document));
    this.savePreviewDocuments(documents);
  }
  async listConversations(_directory: string, projectKey?: string): Promise<ConversationSummary[]> {
    return this.previewDocuments()
      .filter((document) => !projectKey || document.project.key === projectKey)
      .map(summarizeConversation)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  async searchConversations(_directory: string, query: string): Promise<ConversationSummary[]> {
    const needle = query.trim().toLocaleLowerCase();
    const matches = this.previewDocuments().filter((document) => {
      if (!needle) return true;
      return [document.title, document.project.label, ...document.messages.map((message) => message.content)]
        .some((value) => value.toLocaleLowerCase().includes(needle));
    });
    return matches.map(summarizeConversation).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  async renameConversation(directory: string, projectKey: string, id: string, title: string): Promise<ConversationDocument> {
    const document = await this.readConversation(directory, projectKey, id);
    document.title = title;
    document.updatedAt = new Date().toISOString();
    await this.writeConversation(directory, document);
    return document;
  }
  async deleteConversation(_directory: string, projectKey: string, id: string): Promise<void> {
    this.savePreviewDocuments(this.previewDocuments().filter((document) => document.project.key !== projectKey || document.id !== id));
  }
  async moveConversationProject(_directory: string, fromKey: string, project: ProjectIdentity): Promise<void> {
    const documents = this.previewDocuments().map((document) => (
      document.project.key === fromKey ? { ...document, project: { ...project } } : document
    ));
    this.savePreviewDocuments(documents);
  }
  async loadScriptMenu(markdownPath: string): Promise<ScriptMenuItem[]> {
    return parseScriptMenuMarkdown(`1. 预览脚本 - ${markdownPath.replace(/\.md$/i, '.jsx')}`);
  }
  async testProfile() { return { ok: true, modelCount: 2 }; }
  async listModels() { return [{ id: 'preview-model', contextWindow: 128000 }]; }
  async getBalance() { return { amount: 88.8, currency: 'CNY' }; }
  async chat(_profile: ApiProfile, _messages: Array<Pick<ChatMessage, 'role' | 'content'>>, onEvent?: (event: any) => void) {
    const event = { type: 'text', text: '开发预览模式不会调用真实 API。请在 AE 中安装扩展后使用。' };
    onEvent?.(event);
    return [event];
  }
  async generateImage(): Promise<string> { throw new Error('开发预览模式不能生成素材'); }
  async submitVideo(): Promise<string> { throw new Error('开发预览模式不能生成素材'); }
  async pollVideo() { return { state: 'failed' as const, error: '开发预览模式' }; }
  async download(): Promise<string> { throw new Error('开发预览模式不能下载素材'); }

  private previewDocuments(): ConversationDocument[] {
    const saved = localStorage.getItem(this.conversationStorageKey);
    return saved ? JSON.parse(saved) : [];
  }

  private savePreviewDocuments(documents: ConversationDocument[]): void {
    localStorage.setItem(this.conversationStorageKey, JSON.stringify(documents));
  }
}

let runtime: RuntimeBridge | undefined;

function previewBasename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

export function normalizeCepPath(value: string): string {
  const decoded = /^file:/i.test(value) ? decodeURIComponent(value) : value;
  return decoded.replace(/^file:\/\/\/?/i, '').replace(/^\/([A-Za-z]:[\\/])/, '$1');
}

export function normalizeCepFolderSelection(result: { err: number; data?: string[] }): string | null {
  if (result.err !== 0 || !result.data?.[0]) return null;
  return normalizeCepPath(result.data[0]);
}

export function normalizeCepFileSelection(result: { err: number; data?: string[] }): string[] {
  if (result.err !== 0 || !result.data) return [];
  return result.data.filter(Boolean).map(normalizeCepPath);
}

export function selectCepDirectory(title = '选择对话归档文件夹'): string | null {
  const cepFs = window.cep?.fs;
  if (!cepFs) return null;
  return normalizeCepFolderSelection(cepFs.showOpenDialog(false, true, title, ''));
}

export function getRuntime(): RuntimeBridge {
  if (runtime) return runtime;
  if (window.__adobe_cep__ && window.cep_node) {
    const extensionPath = normalizeCepPath(window.__adobe_cep__.getSystemPath('extension'));
    const nodePath = window.cep_node.require('path');
    runtime = window.cep_node.require(nodePath.join(extensionPath, 'node', 'runtime.cjs')).createRuntime();
  } else runtime = new PreviewRuntime();
  return runtime!;
}
