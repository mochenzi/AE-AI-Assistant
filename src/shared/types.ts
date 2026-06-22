export type Capability = 'chat' | 'image' | 'video';
export type StructuredOutputMode = 'json_schema' | 'json_object' | 'prompt_only';

export interface ApiProfile {
  id: string;
  name: string;
  baseUrl: string;
  timeoutMs: number;
  capabilities: Capability[];
  headers: Record<string, string>;
  chat?: { model: string; endpoint: string; structuredOutput: StructuredOutputMode; contextWindow?: number };
  image?: { model: string; endpoint: string };
  video?: {
    model: string;
    submitEndpoint: string;
    statusEndpoint: string;
    taskIdPath: string;
    statusPath: string;
    resultUrlPath: string;
    errorPath: string;
    successValues: string[];
    failureValues: string[];
  };
  models?: { endpoint: string; idPath: string; contextPath?: string; lastUpdated?: string };
  balance?: { method: 'GET' | 'POST'; endpoint: string; amountPath: string; currencyPath?: string; lastUpdated?: string };
}

export type MediaTaskStatus = 'queued' | 'submitting' | 'polling' | 'downloading' | 'importing' | 'completed' | 'failed' | 'cancelled';

export interface MediaTask {
  id: string;
  type: 'image' | 'video';
  profileId: string;
  prompt: string;
  status: MediaTaskStatus;
  remoteTaskId?: string;
  remoteUrl?: string;
  localPath?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  usage?: { input: number; output: number; estimated?: boolean };
}

export interface ContextProfile {
  id: string;
  name: string;
  content: string;
  updatedAt: string;
}

export interface PromptTemplate {
  id: string;
  title: string;
  category: string;
  target: 'ae' | 'image' | 'video';
  body: string;
  variables: string[];
  builtin: boolean;
}
