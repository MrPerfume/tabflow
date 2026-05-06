<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { sendMessage } from '../../src/messaging';
import type { DashboardData, GroupType, GroupWithTabs, Settings } from '../../src/types';
import { getSiteLabel } from '../../src/utils';

const loading = ref(true);
const groups = ref<GroupWithTabs[]>([]);
const recentDeletedGroups = ref<GroupWithTabs[]>([]);
const settings = ref<Settings>({ closeAfterSave: true, snapshotLimit: 8, theme: 'light', language: 'zh_CN' });
const selectedId = ref<string>('');
const query = ref('');
const activeType = ref<GroupType | 'all'>('all');
const toast = ref('');
const fatalError = ref('');
const newTodo = ref('');
const draggedTabId = ref('');
const collapsedSiteKeys = ref<Record<string, boolean>>({});

const searchKeyword = computed(() => query.value.trim().toLowerCase());
const tabMatchesKeyword = (tab: GroupWithTabs['tabs'][number], keyword: string) =>
  tab.title.toLowerCase().includes(keyword) || tab.url.toLowerCase().includes(keyword);

const visibleGroups = computed(() => {
  const keyword = searchKeyword.value;
  return groups.value.filter((group) => {
    const matchType = activeType.value === 'all' || group.type === activeType.value;
    const matchKeyword =
      !keyword ||
      group.title.toLowerCase().includes(keyword) ||
      group.note?.toLowerCase().includes(keyword) ||
      group.tabs.some((tab) => tab.title.toLowerCase().includes(keyword) || tab.url.toLowerCase().includes(keyword));
    return matchType && matchKeyword;
  });
});

const selectedGroup = computed(() => visibleGroups.value.find((group) => group.id === selectedId.value) ?? visibleGroups.value[0]);
const selectedTabGroups = computed(() => {
  const group = selectedGroup.value;
  if (!group) return [];
  const keyword = searchKeyword.value;
  const matchingTabs = keyword ? group.tabs.filter((tab) => tabMatchesKeyword(tab, keyword)) : [];
  const tabsToShow = keyword && matchingTabs.length ? matchingTabs : group.tabs;
  const buckets = new Map<string, typeof group.tabs>();
  for (const tab of tabsToShow) {
    const label = getSiteLabel(tab.url);
    const bucket = buckets.get(label) ?? [];
    bucket.push(tab);
    buckets.set(label, bucket);
  }
  return [...buckets.entries()].map(([site, tabs]) => ({
    site,
    tabs,
    preview: tabs.slice(0, 3),
    collapsed: keyword ? false : isSiteCollapsed(site, tabs.length),
  }));
});
const typeCounts = computed(() => ({
  all: groups.value.length,
  session: groups.value.filter((group) => group.type === 'session').length,
  snapshot: groups.value.filter((group) => group.type === 'snapshot').length,
  bookmark: groups.value.filter((group) => group.type === 'bookmark').length,
  board: groups.value.filter((group) => group.type === 'board').length,
}));
const overview = computed(() => {
  const tabs = groups.value.flatMap((group) => group.tabs);
  const sites = new Set(tabs.map((tab) => getSiteLabel(tab.url)));
  const snapshots = groups.value.filter((group) => group.type === 'snapshot').sort((a, b) => b.createdAt - a.createdAt);
  const openTodos = groups.value.flatMap((group) => group.todos).filter((todo) => !todo.done).length;
  return {
    totalTabs: tabs.length,
    totalSites: sites.size,
    snapshotCount: snapshots.length,
    openTodos,
    lastSnapshotAt: snapshots[0]?.createdAt,
  };
});

watch(selectedGroup, (group) => {
  if (group) selectedId.value = group.id;
});

async function refresh() {
  loading.value = true;
  fatalError.value = '';
  try {
    const data = await sendMessage<DashboardData>({ type: 'GET_DASHBOARD_DATA' });
    groups.value = data.groups;
    recentDeletedGroups.value = data.recentDeletedGroups;
    settings.value = data.settings;
    if (!selectedId.value && data.groups[0]) selectedId.value = data.groups[0].id;
  } catch (error) {
    fatalError.value = error instanceof Error ? error.message : '控制台加载失败';
    toast.value = fatalError.value;
  } finally {
    loading.value = false;
  }
}

async function run(label: string, action: () => Promise<unknown>) {
  toast.value = `${label}中...`;
  try {
    await action();
    toast.value = `${label}完成`;
    await refresh();
  } catch (error) {
    toast.value = error instanceof Error ? error.message : '操作失败';
  }
}

async function saveSource(source: 'current-tab' | 'current-window' | 'current-group') {
  await run('保存', async () => {
    const result = await sendMessage<{ saved: number }>({ type: 'SAVE_TABS', payload: { source } });
    if (!result.saved) throw new Error('没有可保存的网页标签');
  });
}

async function restore(groupId: string) {
  await run('恢复到当前窗口', () => sendMessage({ type: 'RESTORE_GROUP', payload: { groupId, mode: 'current-window' } }));
}

async function removeGroup(group: GroupWithTabs) {
  if (!confirm(`删除「${group.title}」？删除后不会出现在列表中。`)) return;
  await run('删除分组', () => sendMessage({ type: 'DELETE_GROUP', payload: { groupId: group.id } }));
}

async function restoreDeleted(groupId: string) {
  await run('恢复删除项', () => sendMessage({ type: 'RESTORE_DELETED_GROUP', payload: { groupId } }));
}

async function removeTab(tabId: string) {
  await run('删除标签', () => sendMessage({ type: 'DELETE_TAB', payload: { tabId } }));
}

async function reorderTab(targetTabId: string) {
  const group = selectedGroup.value;
  const sourceTabId = draggedTabId.value;
  if (!group || !sourceTabId || sourceTabId === targetTabId) return;
  const ids = group.tabs.map((tab) => tab.id);
  const from = ids.indexOf(sourceTabId);
  const to = ids.indexOf(targetTabId);
  if (from < 0 || to < 0) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]!);
  draggedTabId.value = '';
  await run('调整排序', () => sendMessage({ type: 'REORDER_TABS', payload: { groupId: group.id, orderedTabIds: ids } }));
}

async function updateSelectedGroup(patch: { title?: string; note?: string; pinned?: boolean }) {
  const group = selectedGroup.value;
  if (!group) return;
  await run('更新', () => sendMessage({ type: 'UPDATE_GROUP', payload: { groupId: group.id, ...patch } }));
}

async function addTodo() {
  const group = selectedGroup.value;
  const text = newTodo.value.trim();
  if (!group || !text) return;
  newTodo.value = '';
  await run('添加 TODO', () => sendMessage({ type: 'ADD_TODO', payload: { groupId: group.id, text } }));
}

async function copyExport(format: 'markdown' | 'json') {
  const group = selectedGroup.value;
  if (!group) return;
  await run('复制导出内容', async () => {
    const { content } = await sendMessage<{ content: string }>({ type: 'EXPORT_GROUP', payload: { groupId: group.id, format } });
    await navigator.clipboard.writeText(content);
  });
}

async function importBookmarks() {
  const granted = await chrome.permissions.request({ permissions: ['bookmarks'] });
  if (!granted) {
    toast.value = '未授予书签权限';
    return;
  }
  await run('导入书签', () => sendMessage({ type: 'IMPORT_BOOKMARKS' }));
}

async function updateSettings(patch: Partial<Settings>) {
  await run('保存设置', () => sendMessage({ type: 'UPDATE_SETTINGS', payload: patch }));
}

function typeLabel(type: GroupType) {
  return { session: '会话', snapshot: '快照', bookmark: '书签', board: '看板' }[type];
}

function relativeTime(timestamp?: number) {
  if (!timestamp) return '暂无';
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

function siteStateKey(site: string) {
  return `${selectedGroup.value?.id ?? 'none'}:${site}`;
}

function isSiteCollapsed(site: string, count: number) {
  const stored = collapsedSiteKeys.value[siteStateKey(site)];
  return stored ?? count > 2;
}

function toggleSiteGroup(site: string, count: number) {
  const key = siteStateKey(site);
  collapsedSiteKeys.value = { ...collapsedSiteKeys.value, [key]: !isSiteCollapsed(site, count) };
}

function setAllSiteGroups(collapsed: boolean) {
  const patch: Record<string, boolean> = {};
  for (const siteGroup of selectedTabGroups.value) patch[siteStateKey(siteGroup.site)] = collapsed;
  collapsedSiteKeys.value = { ...collapsedSiteKeys.value, ...patch };
}

onMounted(refresh);
</script>

<template>
  <main class="app">
    <aside class="sidebar">
      <header class="brand">
        <div class="logo">TF</div>
        <div>
          <h1>TabFlow</h1>
          <p>本地优先标签管理</p>
        </div>
      </header>

      <div class="quick-actions card">
        <button class="btn primary" @click="saveSource('current-tab')">保存当前标签</button>
        <button class="btn" @click="saveSource('current-window')">保存当前窗口</button>
        <button class="btn" @click="saveSource('current-group')">保存标签组</button>
        <button class="btn" @click="run('创建快照', () => sendMessage({ type: 'CREATE_SNAPSHOT' }))">创建快照</button>
      </div>

      <nav class="filters">
        <button :class="{ active: activeType === 'all' }" @click="activeType = 'all'">全部 <span>{{ typeCounts.all }}</span></button>
        <button :class="{ active: activeType === 'session' }" @click="activeType = 'session'">会话 <span>{{ typeCounts.session }}</span></button>
        <button :class="{ active: activeType === 'snapshot' }" @click="activeType = 'snapshot'">快照 <span>{{ typeCounts.snapshot }}</span></button>
        <button :class="{ active: activeType === 'bookmark' }" @click="activeType = 'bookmark'">书签 <span>{{ typeCounts.bookmark }}</span></button>
      </nav>

      <section class="settings card">
        <h2>设置</h2>
        <label>
          <input type="checkbox" :checked="settings.closeAfterSave" @change="updateSettings({ closeAfterSave: ($event.target as HTMLInputElement).checked })" />
          保存后关闭原标签
        </label>
        <label>
          快照数量
          <input class="number" type="number" min="1" max="30" :value="settings.snapshotLimit" @change="updateSettings({ snapshotLimit: Number(($event.target as HTMLInputElement).value) || 8 })" />
        </label>
        <button class="btn" @click="importBookmarks">导入浏览器书签</button>
      </section>

      <section class="overview card">
        <div class="overview-head">
          <h2>概览</h2>
          <span>{{ relativeTime(overview.lastSnapshotAt) }}</span>
        </div>
        <div class="overview-grid">
          <div>
            <strong>{{ overview.totalTabs }}</strong>
            <span>总标签</span>
          </div>
          <div>
            <strong>{{ overview.totalSites }}</strong>
            <span>站点</span>
          </div>
          <div>
            <strong>{{ overview.snapshotCount }}</strong>
            <span>快照</span>
          </div>
          <div>
            <strong>{{ overview.openTodos }}</strong>
            <span>待办</span>
          </div>
        </div>
        <div class="overview-line">
          <span>打开控制台</span>
          <kbd>Alt</kbd><kbd>Shift</kbd><kbd>F</kbd>
        </div>
        <div class="deleted-preview">
          <div class="deleted-title">
            <span>最近删除</span>
            <strong>{{ recentDeletedGroups.length }}</strong>
          </div>
          <div v-if="!recentDeletedGroups.length" class="subtle">暂无删除项</div>
          <article v-for="group in recentDeletedGroups" :key="group.id" class="deleted-item">
            <div>
              <strong class="truncate">{{ group.title }}</strong>
              <span>{{ group.tabs.length }} 个标签</span>
            </div>
            <button class="btn ghost" type="button" @click="restoreDeleted(group.id)">恢复</button>
          </article>
        </div>
      </section>
    </aside>

    <section class="middle">
      <div class="search-row">
        <input v-model="query" type="search" placeholder="搜索标题、备注或 URL" />
      </div>

      <div v-if="fatalError" class="empty card error-state">
        <strong>控制台暂时无法读取数据</strong>
        <p>{{ fatalError }}</p>
        <button class="btn primary" @click="refresh">重试</button>
      </div>
      <div v-else-if="loading" class="empty card">加载中...</div>
      <div v-else-if="!visibleGroups.length" class="empty card">没有找到会话。先保存一个标签或窗口吧。</div>
      <template v-else>
        <article
          v-for="group in visibleGroups"
          :key="group.id"
          class="group-card"
          :class="{ selected: group.id === selectedGroup?.id }"
          @click="selectedId = group.id"
        >
          <div class="group-main">
            <span class="type">{{ typeLabel(group.type) }}</span>
            <strong class="truncate">{{ group.title }}</strong>
            <p class="truncate">{{ group.note || group.tabs[0]?.url || '无备注' }}</p>
          </div>
          <div class="count">{{ group.tabs.length }}</div>
        </article>
      </template>
    </section>

    <section class="detail">
      <div v-if="!selectedGroup" class="empty card">请选择一个会话</div>
      <template v-else>
        <header class="detail-header card">
          <div>
            <span class="type">{{ typeLabel(selectedGroup.type) }}</span>
            <input class="title-input" :value="selectedGroup.title" @change="updateSelectedGroup({ title: ($event.target as HTMLInputElement).value })" />
            <p>{{ selectedGroup.tabs.length }} 个标签 · {{ new Date(selectedGroup.createdAt).toLocaleString('zh-CN') }}</p>
          </div>
          <div class="detail-actions">
            <button class="btn primary" @click="restore(selectedGroup.id)">恢复</button>
            <button class="btn" @click="copyExport('markdown')">复制 Markdown</button>
            <button class="btn" @click="copyExport('json')">复制 JSON</button>
            <button class="btn danger" @click="removeGroup(selectedGroup)">删除</button>
          </div>
        </header>

        <section class="note card">
          <h2>备注</h2>
          <textarea :value="selectedGroup.note" placeholder="记录这个会话的上下文、用途或恢复提示" @blur="updateSelectedGroup({ note: ($event.target as HTMLTextAreaElement).value })" />
        </section>

        <section class="todo card">
          <h2>TODO</h2>
          <form class="todo-form" @submit.prevent="addTodo">
            <input v-model="newTodo" placeholder="添加一个待办" />
            <button class="btn primary">添加</button>
          </form>
          <div v-if="!selectedGroup.todos.length" class="subtle">暂无 TODO</div>
          <label v-for="todo in selectedGroup.todos" :key="todo.id" class="todo-item">
            <input type="checkbox" :checked="todo.done" @change="run('更新 TODO', () => sendMessage({ type: 'TOGGLE_TODO', payload: { todoId: todo.id, done: ($event.target as HTMLInputElement).checked } }))" />
            <span :class="{ done: todo.done }">{{ todo.text }}</span>
            <button class="btn ghost" type="button" @click="run('删除 TODO', () => sendMessage({ type: 'DELETE_TODO', payload: { todoId: todo.id } }))">删除</button>
          </label>
        </section>

        <section class="tabs card">
          <div class="tabs-title">
            <h2>标签</h2>
            <div class="tabs-tools">
              <span>{{ selectedTabGroups.length }} 个站点分组</span>
              <button class="btn ghost" type="button" @click="setAllSiteGroups(true)">聚合</button>
              <button class="btn ghost" type="button" @click="setAllSiteGroups(false)">展开</button>
            </div>
          </div>
          <div v-for="siteGroup in selectedTabGroups" :key="siteGroup.site" class="site-group">
            <header class="site-header" :class="{ collapsed: siteGroup.collapsed }">
              <button class="site-toggle" type="button" @click="toggleSiteGroup(siteGroup.site, siteGroup.tabs.length)">
                <span class="chevron">{{ siteGroup.collapsed ? '›' : '⌄' }}</span>
                <span class="site-title">{{ siteGroup.site }}</span>
                <span class="site-count">{{ siteGroup.tabs.length }} 个标签</span>
              </button>
              <div v-if="siteGroup.collapsed" class="site-preview">
                <span v-for="tab in siteGroup.preview" :key="tab.id" class="truncate">{{ tab.title }}</span>
                <span v-if="siteGroup.tabs.length > siteGroup.preview.length">还有 {{ siteGroup.tabs.length - siteGroup.preview.length }} 个</span>
              </div>
            </header>
            <div v-if="!siteGroup.collapsed" class="site-tabs">
              <article
                v-for="tab in siteGroup.tabs"
                :key="tab.id"
                class="tab-row"
                draggable="true"
                @dragstart="draggedTabId = tab.id"
                @dragover.prevent
                @drop="reorderTab(tab.id)"
              >
                <img v-if="tab.favIconUrl" :src="tab.favIconUrl" alt="" />
                <div>
                  <a class="truncate" :href="tab.url" target="_blank">{{ tab.title }}</a>
                  <p class="truncate">{{ tab.url }}</p>
                </div>
                <button class="btn ghost" @click="removeTab(tab.id)">删除</button>
              </article>
            </div>
          </div>
        </section>
      </template>
    </section>

    <p v-if="toast" class="toast">{{ toast }}</p>
  </main>
</template>

<style scoped>
.app {
  width: 100%;
  height: 100vh;
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(260px, 360px) minmax(0, 1fr);
  gap: 18px;
  padding: 18px;
  overflow: auto;
}

.sidebar,
.middle,
.detail {
  min-height: 0;
  min-width: 0;
  overflow: auto;
}

.sidebar {
  display: flex;
  flex-direction: column;
}

.brand {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 18px;
}

.logo {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: var(--primary);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 900;
}

h1,
h2,
p {
  margin: 0;
}

.brand h1 {
  font-size: 22px;
}

.brand p,
.subtle {
  color: var(--muted);
  font-size: 13px;
}

.quick-actions,
.settings {
  padding: 12px;
  display: grid;
  gap: 10px;
  margin-bottom: 16px;
}

.filters {
  display: grid;
  gap: 8px;
  margin-bottom: 16px;
}

.filters button {
  display: flex;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-weight: 800;
}

.filters button.active {
  background: #ecfdf5;
  color: var(--primary-dark);
}

.settings h2,
.overview h2,
.note h2,
.todo h2,
.tabs h2 {
  font-size: 14px;
  margin-bottom: 10px;
}

.settings label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  color: var(--muted);
  font-weight: 700;
}

.overview {
  margin-top: auto;
  padding: 12px;
}

.overview-head,
.deleted-title,
.overview-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.overview-head h2 {
  margin-bottom: 0;
}

.overview-head span,
.deleted-title,
.overview-line {
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.overview-grid div {
  min-width: 0;
  padding: 9px;
  border-radius: 8px;
  background: #f8fafc;
}

.overview-grid strong {
  display: block;
  color: var(--text);
  font-size: 18px;
  line-height: 1.1;
}

.overview-grid span {
  display: block;
  margin-top: 4px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
}

.overview-line {
  justify-content: flex-start;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

kbd {
  min-width: 24px;
  padding: 3px 6px;
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 6px;
  background: #fff;
  color: var(--text);
  text-align: center;
  font: inherit;
  font-size: 11px;
  font-weight: 900;
}

.deleted-preview {
  display: grid;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border);
}

.deleted-title strong {
  color: var(--primary-dark);
}

.deleted-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
}

.deleted-item div {
  min-width: 0;
}

.deleted-item strong {
  display: block;
  color: var(--text);
  font-size: 12px;
}

.deleted-item span {
  display: block;
  margin-top: 3px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
}

.number {
  width: 72px;
}

.search-row {
  position: sticky;
  top: 0;
  background: var(--bg);
  padding-bottom: 12px;
  z-index: 1;
}

.search-row input,
.todo-form input,
.title-input,
textarea,
.number {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
  background: #fff;
  color: var(--text);
  outline: none;
}

.group-card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  padding: 13px;
  margin-bottom: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}

.group-card.selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px #10b98120;
}

.group-main {
  min-width: 0;
}

.type {
  display: inline-flex;
  margin-bottom: 6px;
  padding: 3px 7px;
  border-radius: 999px;
  background: #ecfdf5;
  color: var(--primary-dark);
  font-size: 11px;
  font-weight: 900;
}

.group-card strong {
  display: block;
  font-size: 15px;
}

.group-card p {
  margin-top: 5px;
  color: var(--muted);
  font-size: 12px;
}

.count {
  align-self: center;
  color: var(--muted);
  font-weight: 900;
}

.detail {
  display: grid;
  align-content: start;
  gap: 14px;
}

.detail-header {
  padding: 18px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 16px;
}

.title-input {
  border: 0;
  padding: 0;
  font-size: 24px;
  font-weight: 900;
}

.detail-header p {
  margin-top: 8px;
  color: var(--muted);
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  max-width: 360px;
}

.note,
.todo,
.tabs,
.empty {
  padding: 16px;
}

.error-state {
  display: grid;
  gap: 10px;
}

.error-state strong {
  color: #b91c1c;
}

.error-state p {
  color: var(--muted);
}

textarea {
  min-height: 86px;
  resize: vertical;
}

.todo-form {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
  margin-bottom: 10px;
}

.todo-item,
.tab-row {
  display: grid;
  align-items: center;
  gap: 10px;
  border-top: 1px solid var(--border);
  padding: 10px 0;
}

.todo-item {
  grid-template-columns: auto 1fr auto;
}

.todo-item .done {
  color: var(--muted);
  text-decoration: line-through;
}

.tab-row {
  grid-template-columns: 20px 1fr auto;
}

.tabs-title,
.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tabs-title span,
.site-header span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.tabs-tools {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  min-width: 0;
}

.site-group {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #f8fafc;
  overflow: hidden;
  padding: 0;
  margin-top: 10px;
}

.site-header {
  min-height: 44px;
  padding: 8px 10px;
}

.site-header.collapsed {
  align-items: flex-start;
}

.site-toggle {
  min-width: 0;
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  flex: 1;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.site-toggle:hover .site-title {
  color: var(--primary-dark);
}

.chevron {
  width: 16px;
  color: var(--muted);
  font-size: 18px;
  line-height: 1;
}

.site-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--primary-dark);
  font-size: 13px;
  font-weight: 900;
}

.site-count {
  white-space: nowrap;
}

.site-preview {
  min-width: 0;
  max-width: 46%;
  display: grid;
  gap: 4px;
  justify-items: end;
}

.site-preview span {
  max-width: 100%;
}

.site-tabs {
  background: #fff;
  border-top: 1px solid var(--border);
  padding: 0 10px;
}

.site-header strong {
  color: var(--primary-dark);
  font-size: 13px;
}

.tab-row img {
  width: 18px;
  height: 18px;
}

.tab-row div {
  min-width: 0;
}

.tab-row a {
  display: block;
  color: var(--text);
  font-weight: 800;
  text-decoration: none;
}

.tab-row p {
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
}

.toast {
  position: fixed;
  right: 22px;
  bottom: 22px;
  padding: 10px 14px;
  border-radius: 8px;
  background: #0f172a;
  color: #fff;
  box-shadow: var(--shadow);
}

@media (max-width: 1060px) {
  .app {
    height: auto;
    min-height: 100vh;
    grid-template-columns: 240px minmax(0, 1fr);
    align-content: start;
  }

  .detail {
    grid-column: 1 / -1;
  }
}

@media (max-width: 760px) {
  .app {
    grid-template-columns: 1fr;
    padding: 12px;
    gap: 12px;
  }

  .sidebar,
  .middle,
  .detail {
    overflow: visible;
  }

  .quick-actions {
    grid-template-columns: 1fr 1fr;
  }

  .filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .detail-header {
    grid-template-columns: 1fr;
  }

  .detail-actions {
    justify-content: flex-start;
    max-width: none;
  }

  .site-header {
    display: grid;
    align-items: start;
  }

  .site-preview {
    max-width: none;
    justify-items: start;
    padding-left: 24px;
  }
}
</style>
