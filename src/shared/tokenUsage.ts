import { getEncoding } from 'js-tiktoken';
import type { ChatMessage } from './types';

const encoding = getEncoding('o200k_base');

export function estimateMessages(messages: Array<Pick<ChatMessage, 'role' | 'content'>>): number {
  return messages.reduce((total, message) => total + 4 + encoding.encode(message.role).length + encoding.encode(message.content).length, 3);
}

export function mergeUsage(a: { input: number; output: number }, b: { input: number; output: number }) {
  return { input: a.input + b.input, output: a.output + b.output };
}
