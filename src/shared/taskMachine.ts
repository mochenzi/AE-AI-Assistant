import type { MediaTaskStatus } from './types';

export type TaskEvent = 'SUBMIT' | 'TASK_ACCEPTED' | 'REMOTE_READY' | 'DOWNLOADED' | 'IMPORTED' | 'FAIL' | 'CANCEL' | 'RETRY';
const transitions: Record<MediaTaskStatus, Partial<Record<TaskEvent, MediaTaskStatus>>> = {
  queued: { SUBMIT: 'submitting', CANCEL: 'cancelled' },
  submitting: { TASK_ACCEPTED: 'polling', REMOTE_READY: 'downloading', FAIL: 'failed', CANCEL: 'cancelled' },
  polling: { REMOTE_READY: 'downloading', FAIL: 'failed', CANCEL: 'cancelled' },
  downloading: { DOWNLOADED: 'importing', FAIL: 'failed', CANCEL: 'cancelled' },
  importing: { IMPORTED: 'completed', FAIL: 'failed' },
  completed: {},
  failed: { RETRY: 'queued' },
  cancelled: { RETRY: 'queued' },
};

export function transitionTask(state: MediaTaskStatus, event: TaskEvent): MediaTaskStatus {
  const next = transitions[state][event];
  if (!next) throw new Error(`任务状态 ${state} 不允许事件 ${event}`);
  return next;
}
