<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { sendMessage } from '../../src/messaging';
import type { DashboardData, GroupWithTabs } from '../../src/types';

const loading = ref(true);
const status = ref('');
const groups = ref<GroupWithTabs[]>([]);

const recentGroups = computed(() => groups.value.filter((group) => group.type !== 'snapshot').slice(0, 5));
const snapshots = computed(() => groups.value.filter((group) => group.type === 'snapshot').slice(0, 3));

async function refresh() {
  loading.value = true;
  try {
    const data = await sendMessage<DashboardData>({ type: 'GET_DASHBOARD_DATA' });
    groups.value = data.groups;
  } finally {
    loading.value = false;
  }
}

async function run(label: string, action: () => Promise<unknown>) {
  status.value = `${label}中...`;
  try {
    await action();
    status.value = `${label}完成`;
    await refresh();
  } catch (error) {
    status.value = error instanceof Error ? error.message : '操作失败';
  }
}

async function saveSource(source: 'current-tab' | 'current-window' | 'current-group') {
  await run('保存', async () => {
    const result = await sendMessage<{ saved: number }>({ type: 'SAVE_TABS', payload: { source } });
    if (!result.saved) throw new Error('没有可保存的网页标签');
  });
}

function openDashboard() {
  const url = chrome.runtime.getURL('/options.html');
  chrome.tabs.query({ url }, (tabs) => {
    const existing = tabs[0];
    if (existing?.id) {
      chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId) chrome.windows.update(existing.windowId, { focused: true });
      return;
    }
    chrome.tabs.create({ url, active: true });
  });
}

onMounted(refresh);
</script>

<template>
  <main class="popup">
    <header class="header">
      <div class="brand">
        <img class="mini-logo" src="/icon.svg" alt="" />
        <div>
          <strong>TabFlow</strong>
          <p>保存、关闭、稍后恢复</p>
        </div>
      </div>
      <button class="btn ghost" @click="openDashboard">控制台</button>
    </header>

    <section class="actions">
      <button class="btn primary" @click="saveSource('current-tab')">保存当前标签</button>
      <button class="btn" @click="saveSource('current-window')">保存当前窗口</button>
      <button class="btn" @click="saveSource('current-group')">保存当前标签组</button>
      <button class="btn" @click="run('创建快照', () => sendMessage({ type: 'CREATE_SNAPSHOT' }))">创建快照</button>
    </section>

    <p v-if="status" class="status">{{ status }}</p>

    <section class="list">
      <h2>最近会话</h2>
      <div v-if="loading" class="empty">加载中...</div>
      <div v-else-if="!recentGroups.length" class="empty">还没有保存过标签</div>
      <article v-for="group in recentGroups" :key="group.id" class="item">
        <div>
          <strong class="truncate">{{ group.title }}</strong>
          <span>{{ group.tabs.length }} 个标签</span>
        </div>
        <button class="btn" @click="run('恢复', () => sendMessage({ type: 'RESTORE_GROUP', payload: { groupId: group.id, mode: 'current-window' } }))">恢复</button>
      </article>
    </section>

    <section v-if="snapshots.length" class="list compact">
      <h2>自动快照</h2>
      <article v-for="group in snapshots" :key="group.id" class="item">
        <div>
          <strong class="truncate">{{ group.title }}</strong>
          <span>{{ group.tabs.length }} 个标签</span>
        </div>
        <button class="btn" @click="run('恢复快照', () => sendMessage({ type: 'RESTORE_GROUP', payload: { groupId: group.id, mode: 'current-window' } }))">打开</button>
      </article>
    </section>
  </main>
</template>

<style scoped>
.popup {
  width: 380px;
  min-height: 520px;
  padding: 16px;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.brand {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
}

.mini-logo {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  object-fit: cover;
  box-shadow: 0 8px 18px #04785724;
}

.header strong {
  font-size: 20px;
}

.header p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 12px;
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.actions .primary {
  grid-column: span 2;
}

.status {
  margin: 12px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: #ecfdf5;
  color: #047857;
  font-weight: 700;
}

.list {
  margin-top: 18px;
}

.list h2 {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--muted);
}

.item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px 0;
  border-top: 1px solid var(--border);
}

.item div {
  min-width: 0;
}

.item strong,
.item span {
  display: block;
}

.item span {
  margin-top: 3px;
  color: var(--muted);
  font-size: 12px;
}

.empty {
  color: var(--muted);
  padding: 18px 0;
}
</style>
