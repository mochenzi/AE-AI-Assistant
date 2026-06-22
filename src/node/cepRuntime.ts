import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { AtomicJsonStore } from './atomicStore';
import { ApiClient } from './apiClient';
import { DpapiVault } from './dpapiVault';
import { createDefaultState, type AppState } from '../shared/appState';
import type { ApiProfile, ChatMessage } from '../shared/types';

class CepRuntime {
  private readonly root = join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'AE AI Assistant');
  private readonly state = new AtomicJsonStore<AppState>(join(this.root, 'state.json'), createDefaultState());
  private readonly secrets = new AtomicJsonStore<Record<string, string>>(join(this.root, 'secrets.json'), {});
  private readonly vault = new DpapiVault();

  getState() { return this.state.read(); }
  saveState(value: AppState) { return this.state.write(value); }
  async saveApiKey(profileId: string, apiKey: string) { const cipher = await this.vault.protect(apiKey); await this.secrets.update((all) => ({ ...all, [profileId]: cipher })); }
  async hasApiKey(profileId: string) { return Boolean((await this.secrets.read())[profileId]); }
  async removeApiKey(profileId: string) { await this.secrets.update((all) => { const next = { ...all }; delete next[profileId]; return next; }); }
  private async client(profile: ApiProfile) { const cipher = (await this.secrets.read())[profile.id]; if (!cipher) throw new Error('该 API 档案尚未保存密钥'); return new ApiClient(profile, await this.vault.unprotect(cipher)); }
  async testProfile(profile: ApiProfile) { const models = await (await this.client(profile)).listModels(); return { ok: true, modelCount: models.length }; }
  async listModels(profile: ApiProfile) { return (await this.client(profile)).listModels(); }
  async getBalance(profile: ApiProfile) { return (await this.client(profile)).getBalance(); }
  async chat(profile: ApiProfile, messages: Array<Pick<ChatMessage, 'role' | 'content'>>, onEvent?: (event: unknown) => void) { const events = []; for await (const event of (await this.client(profile)).streamChat(messages)) { events.push(event); if (onEvent) onEvent(event); } return events; }
  async generateImage(profile: ApiProfile, prompt: string, size: string, outputDirectory: string) {
    const result = await (await this.client(profile)).generateImage(prompt, { size });
    const folder = await this.generatedFolder(outputDirectory); const path = join(folder, `image-${Date.now()}.png`);
    if (result.kind === 'base64') await writeFile(path, Buffer.from(result.value, 'base64'));
    else { const response = await fetch(result.value); if (!response.ok) throw new Error(`素材下载失败（HTTP ${response.status}）`); await writeFile(path, Buffer.from(await response.arrayBuffer())); }
    return path;
  }
  async submitVideo(profile: ApiProfile, prompt: string, ratio: string, duration: number) { return (await this.client(profile)).submitVideo(prompt, { ratio, duration }); }
  async pollVideo(profile: ApiProfile, taskId: string) { return (await this.client(profile)).getVideoStatus(taskId); }
  async download(url: string, outputDirectory: string) { const folder = await this.generatedFolder(outputDirectory); const path = join(folder, `video-${Date.now()}.mp4`); const response = await fetch(url); if (!response.ok) throw new Error(`素材下载失败（HTTP ${response.status}）`); await writeFile(path, Buffer.from(await response.arrayBuffer())); return path; }
  private async generatedFolder(base: string) { const date = new Date().toISOString().slice(0, 10); const folder = join(base, 'AI Generated', date); await mkdir(folder, { recursive: true }); return folder; }
}

export function createRuntime() { return new CepRuntime(); }
