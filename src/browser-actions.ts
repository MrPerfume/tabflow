import { addTodo, deleteTab, deleteTodo, getGroup, getSettings, listDeletedGroups, listGroups, pruneSnapshots, reorderTabs, restoreDeletedGroup, saveGroup, softDeleteGroup, updateGroup, updateSettings, updateTodo } from './db';
import { exportGroup } from './export';
import type { DashboardData, SavedGroup, SavedTab, SaveSource, Settings } from './types';
import { createId, formatDateTime, getSiteLabel, isSaveableUrl, wait } from './utils';

let recentSaveableTabId: number | undefined;

export function rememberSaveableTab(tab?: chrome.tabs.Tab | null) {
  const url = tab?.url ?? tab?.pendingUrl;
  if (typeof tab?.id === 'number' && isSaveableUrl(url)) recentSaveableTabId = tab.id;
}

function toSavedTab(tab: chrome.tabs.Tab, groupId: string, sort: number): SavedTab | null {
  const url = tab.url ?? tab.pendingUrl;
  if (!isSaveableUrl(url)) return null;
  return {
    id: createId('tab'),
    groupId,
    title: tab.title || url,
    url,
    favIconUrl: tab.favIconUrl,
    sort,
    createdAt: Date.now(),
  };
}

async function getRecentSaveableTab(): Promise<chrome.tabs.Tab | undefined> {
  if (typeof recentSaveableTabId === 'number') {
    const tab = await chrome.tabs.get(recentSaveableTabId).catch(() => undefined);
    if (isSaveableUrl(tab?.url ?? tab?.pendingUrl)) return tab;
  }

  const tabs = await chrome.tabs.query({ currentWindow: true });
  return tabs
    .filter((tab) => isSaveableUrl(tab.url ?? tab.pendingUrl))
    .sort((a, b) => ((b as chrome.tabs.Tab & { lastAccessed?: number }).lastAccessed ?? 0) - ((a as chrome.tabs.Tab & { lastAccessed?: number }).lastAccessed ?? 0))[0];
}

async function getActiveOrRecentSaveableTab(): Promise<chrome.tabs.Tab | undefined> {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (isSaveableUrl(active?.url ?? active?.pendingUrl)) {
    rememberSaveableTab(active);
    return active;
  }
  return getRecentSaveableTab();
}

async function queryTabsBySource(source: SaveSource, tabIds?: number[]): Promise<{ tabs: chrome.tabs.Tab[]; title?: string; color?: string }> {
  if (tabIds?.length) {
    const tabs = (await Promise.all(tabIds.map((id) => chrome.tabs.get(id).catch(() => null)))).filter(Boolean) as chrome.tabs.Tab[];
    return { tabs };
  }

  if (source === 'current-tab') {
    const tab = await getActiveOrRecentSaveableTab();
    return { tabs: tab ? [tab] : [] };
  }

  if (source === 'current-group') {
    const active = await getActiveOrRecentSaveableTab();
    if (!active || active.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return { tabs: active ? [active] : [] };
    const group = await chrome.tabGroups.get(active.groupId);
    const tabs = await chrome.tabs.query({ groupId: active.groupId, windowId: active.windowId });
    return { tabs, title: group.title || '标签组', color: group.color };
  }

  const currentWindow = await chrome.windows.getCurrent();
  const tabs = await chrome.tabs.query(currentWindow.id ? { windowId: currentWindow.id } : { currentWindow: true });
  return { tabs };
}

export async function saveTabsFromBrowser(source: SaveSource, options: { tabIds?: number[]; groupTitle?: string; closeOriginal?: boolean } = {}) {
  const settings = await getSettings();
  const { tabs, title, color } = await queryTabsBySource(source, options.tabIds);
  const saveable = tabs.filter((tab) => isSaveableUrl(tab.url ?? tab.pendingUrl));
  if (!saveable.length) return { groupId: null, saved: 0 };

  const now = Date.now();
  const groupId = createId('grp');
  const group: SavedGroup = {
    id: groupId,
    title: options.groupTitle || title || `会话 - ${formatDateTime(now)}`,
    type: source === 'bookmarks' ? 'bookmark' : source === 'snapshot' ? 'snapshot' : source === 'current-group' ? 'tabGroup' : 'session',
    color,
    createdAt: now,
    updatedAt: now,
    sort: now,
    pinned: false,
    deleted: false,
  };
  const savedTabs = saveable.map((tab, index) => toSavedTab(tab, groupId, index)).filter(Boolean) as SavedTab[];
  await saveGroup(group, savedTabs);

  const shouldClose = options.closeOriginal ?? settings.closeAfterSave;
  if (shouldClose && source !== 'snapshot' && source !== 'bookmarks') {
    const removableIds = saveable.map((tab) => tab.id).filter((id): id is number => typeof id === 'number');
    if (removableIds.length) await chrome.tabs.remove(removableIds).catch(() => undefined);
  }

  return { groupId, saved: savedTabs.length };
}

export async function createSnapshot() {
  const windows = await chrome.windows.getAll({ populate: true });
  const tabs = windows.flatMap((window) => window.tabs ?? []).filter((tab) => isSaveableUrl(tab.url ?? tab.pendingUrl));
  if (!tabs.length) return { groupId: null, saved: 0 };

  const now = Date.now();
  const groupId = createId('snap');
  await saveGroup(
    {
      id: groupId,
      title: `自动快照 - ${formatDateTime(now)}`,
      type: 'snapshot',
      createdAt: now,
      updatedAt: now,
      sort: now,
      pinned: false,
      deleted: false,
    },
    tabs.map((tab, index) => toSavedTab(tab, groupId, index)).filter(Boolean) as SavedTab[],
  );
  await pruneSnapshots((await getSettings()).snapshotLimit);
  return { groupId, saved: tabs.length };
}

export async function restoreGroup(groupId: string, mode: 'current-window' | 'new-window' = 'current-window') {
  const group = await getGroup(groupId);
  if (!group) return { restored: 0 };
  if (!group.tabs.length) return { restored: 0 };

  if (mode === 'new-window') {
    const createdWindow = await chrome.windows.create({ url: group.tabs.map((tab) => tab.url), focused: true });
    const createdTabs = createdWindow.tabs?.length
      ? createdWindow.tabs
      : await chrome.tabs.query(createdWindow.id ? { windowId: createdWindow.id } : { currentWindow: true });
    await groupBrowserTabsBySite(createdTabs);
    return { restored: group.tabs.length };
  }

  const createdTabs: chrome.tabs.Tab[] = [];
  for (const [index, tab] of group.tabs.entries()) {
    const created = await chrome.tabs.create({ url: tab.url, active: index === 0 });
    createdTabs.push(created);
    await wait(20);
  }
  await groupBrowserTabsBySite(createdTabs);
  return { restored: group.tabs.length };
}

async function groupBrowserTabsBySite(tabs: chrome.tabs.Tab[]) {
  const buckets = new Map<string, number[]>();
  for (const tab of tabs) {
    if (typeof tab.id !== 'number' || !tab.url) continue;
    const label = getSiteLabel(tab.url);
    const bucket = buckets.get(label) ?? [];
    bucket.push(tab.id);
    buckets.set(label, bucket);
  }

  for (const [label, tabIds] of buckets) {
    if (tabIds.length < 2) continue;
    try {
      const groupId = await chrome.tabs.group({ tabIds });
      await chrome.tabGroups.update(groupId, { title: label, color: siteColor(label) });
    } catch {
      // Some pages may not be groupable immediately after creation; keep restore usable.
    }
  }
}

function siteColor(label: string): chrome.tabGroups.ColorEnum {
  const colors: chrome.tabGroups.ColorEnum[] = ['blue', 'green', 'purple', 'cyan', 'orange', 'pink', 'yellow', 'red', 'grey'];
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length] ?? 'grey';
}

function flattenBookmarks(nodes: chrome.bookmarks.BookmarkTreeNode[], output: chrome.bookmarks.BookmarkTreeNode[] = []) {
  for (const node of nodes) {
    if (node.url) output.push(node);
    if (node.children) flattenBookmarks(node.children, output);
  }
  return output;
}

export async function importBookmarks() {
  const granted = await chrome.permissions.request({ permissions: ['bookmarks'] });
  if (!granted) return { imported: 0, permissionDenied: true };
  const roots = await chrome.bookmarks.getTree();
  const bookmarks = flattenBookmarks(roots).filter((bookmark) => isSaveableUrl(bookmark.url));
  if (!bookmarks.length) return { imported: 0 };
  const now = Date.now();
  const groupId = createId('bm');
  await saveGroup(
    {
      id: groupId,
      title: `书签导入 - ${formatDateTime(now)}`,
      type: 'bookmark',
      createdAt: now,
      updatedAt: now,
      sort: now,
      pinned: false,
      deleted: false,
    },
    bookmarks.map((bookmark, index) => ({
      id: createId('tab'),
      groupId,
      title: bookmark.title || bookmark.url || '未命名书签',
      url: bookmark.url!,
      sort: index,
      createdAt: now,
    })),
  );
  return { groupId, imported: bookmarks.length };
}

export async function getDashboardData(): Promise<DashboardData> {
  const [groups, recentDeletedGroups, settings] = await Promise.all([listGroups(), listDeletedGroups(), getSettings()]);
  return { groups, recentDeletedGroups, settings };
}

export async function exportSavedGroup(groupId: string, format: 'markdown' | 'json') {
  const group = await getGroup(groupId);
  if (!group) throw new Error('分组不存在');
  return { content: exportGroup(group, format) };
}

export const actions = {
  addTodo: async (groupId: string, text: string) => addTodo({ id: createId('todo'), groupId, text, done: false, createdAt: Date.now(), updatedAt: Date.now() }),
  deleteGroup: softDeleteGroup,
  deleteTab,
  deleteTodo,
  reorderTabs,
  restoreDeletedGroup,
  updateGroup,
  updateSettings: (patch: Partial<Settings>) => updateSettings(patch),
  updateTodo,
};
