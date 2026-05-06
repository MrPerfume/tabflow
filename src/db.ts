import type { GroupWithTabs, SavedGroup, SavedTab, Settings, TodoItem } from './types';

const DB_NAME = 'tabflow_db';
const DB_VERSION = 1;

const DEFAULT_SETTINGS: Settings = {
  closeAfterSave: true,
  snapshotLimit: 8,
  theme: 'light',
  language: 'zh_CN',
};

type StoreMap = {
  groups: SavedGroup;
  tabs: SavedTab;
  todos: TodoItem;
  settings: Settings & { id: 'default' };
};

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('groups')) {
        const groups = db.createObjectStore('groups', { keyPath: 'id' });
        groups.createIndex('by-type', 'type');
        groups.createIndex('by-deleted', 'deleted');
        groups.createIndex('by-sort', 'sort');
      }
      if (!db.objectStoreNames.contains('tabs')) {
        const tabs = db.createObjectStore('tabs', { keyPath: 'id' });
        tabs.createIndex('by-groupId', 'groupId');
      }
      if (!db.objectStoreNames.contains('todos')) {
        const todos = db.createObjectStore('todos', { keyPath: 'id' });
        todos.createIndex('by-groupId', 'groupId');
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function tx<T>(storeName: keyof StoreMap, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = work(store);
    let result: T | undefined;
    if (request) request.onsuccess = () => (result = request.result);
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function getAll<T extends keyof StoreMap>(storeName: T): Promise<StoreMap[T][]> {
  return (await tx(storeName, 'readonly', (store) => store.getAll())) as StoreMap[T][];
}

async function put<T extends keyof StoreMap>(storeName: T, value: StoreMap[T]): Promise<void> {
  await tx(storeName, 'readwrite', (store) => store.put(value));
}

async function remove<T extends keyof StoreMap>(storeName: T, id: string): Promise<void> {
  await tx(storeName, 'readwrite', (store) => store.delete(id));
}

export async function getSettings(): Promise<Settings> {
  const value = (await tx('settings', 'readonly', (store) => store.get('default'))) as (Settings & { id: 'default' }) | undefined;
  if (value) return value;
  await put('settings', { id: 'default', ...DEFAULT_SETTINGS });
  return DEFAULT_SETTINGS;
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await put('settings', { id: 'default', ...next });
  return next;
}

export async function saveGroup(group: SavedGroup, tabs: SavedTab[]): Promise<void> {
  await put('groups', group);
  await Promise.all(tabs.map((tab) => put('tabs', tab)));
}

export async function listGroups(): Promise<GroupWithTabs[]> {
  const [groups, tabs, todos] = await Promise.all([getAll('groups'), getAll('tabs'), getAll('todos')]);
  return groups
    .filter((group) => !group.deleted)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.sort - a.sort)
    .map((group) => ({
      ...group,
      tabs: tabs.filter((tab) => tab.groupId === group.id).sort((a, b) => a.sort - b.sort),
      todos: todos.filter((todo) => todo.groupId === group.id).sort((a, b) => a.createdAt - b.createdAt),
    }));
}

export async function listDeletedGroups(limit = 3): Promise<GroupWithTabs[]> {
  const [groups, tabs, todos] = await Promise.all([getAll('groups'), getAll('tabs'), getAll('todos')]);
  return groups
    .filter((group) => group.deleted)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((group) => ({
      ...group,
      tabs: tabs.filter((tab) => tab.groupId === group.id).sort((a, b) => a.sort - b.sort),
      todos: todos.filter((todo) => todo.groupId === group.id).sort((a, b) => a.createdAt - b.createdAt),
    }));
}

export async function getGroup(groupId: string): Promise<GroupWithTabs | undefined> {
  return (await listGroups()).find((group) => group.id === groupId);
}

export async function updateGroup(groupId: string, patch: Partial<Pick<SavedGroup, 'title' | 'note' | 'pinned'>>): Promise<void> {
  const group = (await getAll('groups')).find((item) => item.id === groupId);
  if (!group) return;
  await put('groups', { ...group, ...patch, updatedAt: Date.now() });
}

export async function softDeleteGroup(groupId: string): Promise<void> {
  const group = (await getAll('groups')).find((item) => item.id === groupId);
  if (!group) return;
  await put('groups', { ...group, deleted: true, updatedAt: Date.now() });
}

export async function restoreDeletedGroup(groupId: string): Promise<void> {
  const group = (await getAll('groups')).find((item) => item.id === groupId);
  if (!group || !group.deleted) return;
  const now = Date.now();
  await put('groups', { ...group, deleted: false, updatedAt: now, sort: now });
}

export async function deleteTab(tabId: string): Promise<void> {
  await remove('tabs', tabId);
}

export async function reorderTabs(groupId: string, orderedTabIds: string[]): Promise<void> {
  const tabs = (await getAll('tabs')).filter((tab) => tab.groupId === groupId);
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  await Promise.all(
    orderedTabIds.map((id, index) => {
      const tab = byId.get(id);
      return tab ? put('tabs', { ...tab, sort: index }) : Promise.resolve();
    }),
  );
}

export async function addTodo(todo: TodoItem): Promise<void> {
  await put('todos', todo);
}

export async function updateTodo(todoId: string, patch: Partial<TodoItem>): Promise<void> {
  const todo = (await getAll('todos')).find((item) => item.id === todoId);
  if (!todo) return;
  await put('todos', { ...todo, ...patch, updatedAt: Date.now() });
}

export async function deleteTodo(todoId: string): Promise<void> {
  await remove('todos', todoId);
}

export async function pruneSnapshots(limit: number): Promise<void> {
  const snapshots = (await getAll('groups'))
    .filter((group) => group.type === 'snapshot' && !group.deleted)
    .sort((a, b) => b.createdAt - a.createdAt);
  await Promise.all(snapshots.slice(limit).map((snapshot) => softDeleteGroup(snapshot.id)));
}
