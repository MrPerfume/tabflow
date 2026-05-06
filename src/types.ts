export type GroupType = 'session' | 'snapshot' | 'bookmark' | 'board';

export interface SavedGroup {
  id: string;
  title: string;
  type: GroupType;
  color?: chrome.tabGroups.ColorEnum | string;
  note?: string;
  createdAt: number;
  updatedAt: number;
  sort: number;
  pinned: boolean;
  deleted: boolean;
}

export interface SavedTab {
  id: string;
  groupId: string;
  title: string;
  url: string;
  favIconUrl?: string;
  sort: number;
  createdAt: number;
}

export interface TodoItem {
  id: string;
  groupId: string;
  text: string;
  done: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Settings {
  closeAfterSave: boolean;
  snapshotLimit: number;
  theme: 'light' | 'dark';
  language: 'zh_CN' | 'en';
}

export interface GroupWithTabs extends SavedGroup {
  tabs: SavedTab[];
  todos: TodoItem[];
}

export interface DashboardData {
  groups: GroupWithTabs[];
  recentDeletedGroups: GroupWithTabs[];
  settings: Settings;
}

export type SaveSource = 'current-tab' | 'current-window' | 'current-group' | 'manual' | 'snapshot' | 'bookmarks';

export type TabFlowMessage =
  | { type: 'SAVE_TABS'; payload: { source: SaveSource; tabIds?: number[]; groupTitle?: string; closeOriginal?: boolean } }
  | { type: 'RESTORE_GROUP'; payload: { groupId: string; mode?: 'current-window' | 'new-window' } }
  | { type: 'DELETE_GROUP'; payload: { groupId: string } }
  | { type: 'RESTORE_DELETED_GROUP'; payload: { groupId: string } }
  | { type: 'IMPORT_BOOKMARKS' }
  | { type: 'CREATE_SNAPSHOT' }
  | { type: 'EXPORT_GROUP'; payload: { groupId: string; format: 'markdown' | 'json' } }
  | { type: 'GET_DASHBOARD_DATA' }
  | { type: 'UPDATE_GROUP'; payload: { groupId: string; title?: string; note?: string; pinned?: boolean } }
  | { type: 'DELETE_TAB'; payload: { tabId: string } }
  | { type: 'REORDER_TABS'; payload: { groupId: string; orderedTabIds: string[] } }
  | { type: 'ADD_TODO'; payload: { groupId: string; text: string } }
  | { type: 'TOGGLE_TODO'; payload: { todoId: string; done: boolean } }
  | { type: 'DELETE_TODO'; payload: { todoId: string } }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<Settings> };
