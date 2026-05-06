import type { TabFlowMessage } from './types';

export async function sendMessage<T = unknown>(message: TabFlowMessage): Promise<T> {
  const response = await chrome.runtime.sendMessage(message);
  if (!response?.ok) throw new Error(response?.error || '操作失败');
  return response.result as T;
}
