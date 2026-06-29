import type { Conversation } from './appState';
import type { ContextProfile } from './types';
import type { ConversationDocument, ProjectIdentity } from './conversationWorkspace';

function copyJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function convertLegacyConversations(
  legacy: Conversation[],
  project: ProjectIdentity,
  contexts: ContextProfile[],
  at: string,
): ConversationDocument[] {
  return legacy.map((conversation) => {
    const selectedContexts = contexts.filter((context) =>
      conversation.contextProfileIds.includes(context.id),
    );

    return {
      version: 1,
      id: conversation.id,
      project: { ...project },
      title: conversation.title,
      messages: copyJson(conversation.messages),
      markdownSnapshots: selectedContexts.map((context) => ({
        name: context.name,
        sourcePath: `context:${context.id}`,
        content: context.content,
      })),
      contextProfileIds: copyJson(conversation.contextProfileIds),
      includeActiveComposition: false,
      chatMode: 'chat',
      tokenUsage: { input: 0, output: 0 },
      archived: conversation.archived,
      handoffSummary: conversation.handoffSummary,
      createdAt: conversation.createdAt,
      updatedAt: at,
    };
  });
}

export async function persistLegacyConversations(
  documents: ConversationDocument[],
  write: (document: ConversationDocument) => Promise<void>,
  clearLegacyState: () => Promise<void>,
): Promise<void> {
  for (const document of documents) await write(document);
  await clearLegacyState();
}
