import { mkdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { AtomicJsonStore } from './atomicStore';
import { ApiClient } from './apiClient';
import { DpapiVault } from './dpapiVault';
import { createDefaultState, type AppState } from '../shared/appState';
import type { ApiProfile, ChatMessage, ContextProfile } from '../shared/types';
import { createArchiveFilename, serializeConversation, type ArchiveConversation } from '../shared/conversationArchive';

export async function writeConversationArchive(directory: string, conversation: ArchiveConversation, contexts: ContextProfile[]): Promise<string> {
  let directoryStat;
  try {
    directoryStat = await stat(directory);
  } catch {
    throw new Error('归档目录不存在或无法访问');
  }
  if (!directoryStat.isDirectory()) throw new Error('归档目录不是文件夹');

  const initialPath = join(directory, createArchiveFilename(conversation.title, conversation.createdAt, conversation.id));
  let archivePath = initialPath;
  for (let suffix = 2; ; suffix += 1) {
    try {
      await stat(archivePath);
      archivePath = initialPath.replace(/\.md$/i, `-${suffix}.md`);
    } catch {
      break;
    }
  }
  const temporaryPath = `${archivePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, serializeConversation(conversation, contexts), { encoding: 'utf8', flag: 'wx' });
    await rename(temporaryPath, archivePath);
    return archivePath;
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`归档目录无法写入：${reason}`);
  }
}

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
  async archiveConversation(directory: string, conversation: ArchiveConversation, contexts: ContextProfile[]) { return writeConversationArchive(directory, conversation, contexts); }
  private async generatedFolder(base: string) { const date = new Date().toISOString().slice(0, 10); const folder = join(base, 'AI Generated', date); await mkdir(folder, { recursive: true }); return folder; }
}

export function createRuntime() { return new CepRuntime(); }
