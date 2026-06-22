import { createDefaultState, type AppState } from '../shared/appState';
import type { AeActionPlan } from '../shared/actionProtocol';
import type { ApiProfile, ChatMessage } from '../shared/types';

declare global {
  interface Window {
    __adobe_cep__?: { evalScript(script: string, callback: (result: string) => void): void; getSystemPath(name: string): string };
    cep_node?: { require(id: string): any };
  }
}

export interface ProjectContext {
  projectName: string;
  projectPath: string;
  revision: string;
  activeComp: null | { id: number; name: string; width: number; height: number; duration: number; frameRate: number; layerCount: number };
  selectedLayers: Array<{ id: number; name: string; type: string; inPoint: number; outPoint: number }>;
}

const fallbackProject: ProjectContext = { projectName: '开发预览工程.aep', projectPath: '', revision: 'preview|1|3|', activeComp: { id: 1, name: 'Main', width: 1920, height: 1080, duration: 10, frameRate: 25, layerCount: 3 }, selectedLayers: [] };

function parseHost<T>(raw: string): T {
  const result = JSON.parse(raw) as { ok: boolean; value?: T; error?: string };
  if (!result.ok) throw new Error(result.error || 'AE 执行失败');
  return result.value as T;
}

export const hostBridge = {
  isCep: () => Boolean(window.__adobe_cep__),
  getProjectContext: (): Promise<ProjectContext> => !window.__adobe_cep__ ? Promise.resolve(fallbackProject) : new Promise((resolve, reject) => window.__adobe_cep__!.evalScript('AEAI.getProjectContext()', (raw) => { try { resolve(parseHost<ProjectContext>(raw)); } catch (error) { reject(error); } })),
  executePlan: (plan: AeActionPlan): Promise<unknown> => !window.__adobe_cep__ ? Promise.resolve({ preview: true }) : new Promise((resolve, reject) => {
    const encoded = encodeURIComponent(JSON.stringify(plan)).replace(/'/g, '%27');
    window.__adobe_cep__!.evalScript(`AEAI.executePlan('${encoded}')`, (raw) => { try { resolve(parseHost(raw)); } catch (error) { reject(error); } });
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
}

class PreviewRuntime implements RuntimeBridge {
  private state = createDefaultState();
  async getState() { const saved = localStorage.getItem('ae-ai-preview'); return saved ? JSON.parse(saved) : this.state; }
  async saveState(value: AppState) { this.state = value; localStorage.setItem('ae-ai-preview', JSON.stringify(value)); }
  async saveApiKey() { return; } async hasApiKey() { return false; } async removeApiKey() { return; }
  async testProfile() { return { ok: true, modelCount: 2 }; }
  async listModels() { return [{ id: 'preview-model', contextWindow: 128000 }]; }
  async getBalance() { return { amount: 88.8, currency: 'CNY' }; }
  async chat(_profile: ApiProfile, _messages: Array<Pick<ChatMessage, 'role' | 'content'>>, onEvent?: (event: any) => void) { const event = { type: 'text', text: '开发预览模式不会调用真实 API。请在 AE 中安装扩展后使用。' }; onEvent?.(event); return [event]; }
  async generateImage(): Promise<string> { throw new Error('开发预览模式不能生成素材'); }
  async submitVideo(): Promise<string> { throw new Error('开发预览模式不能生成素材'); }
  async pollVideo() { return { state: 'failed' as const, error: '开发预览模式' }; }
  async download(): Promise<string> { throw new Error('开发预览模式不能下载素材'); }
}

let runtime: RuntimeBridge | undefined;
export function normalizeCepPath(value: string): string {
  return decodeURIComponent(value).replace(/^file:\/\/\/?/i, '').replace(/^\/([A-Za-z]:[\\/])/, '$1');
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
