import { actions, createSnapshot, exportSavedGroup, getDashboardData, importBookmarks, rememberSaveableTab, restoreGroup, saveTabsFromBrowser } from '../src/browser-actions';
import type { TabFlowMessage } from '../src/types';

export default defineBackground(() => {
  const rememberActiveTab = async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    rememberSaveableTab(tab);
  };

  const openDashboard = async () => {
    await rememberActiveTab();
    const url = chrome.runtime.getURL('/options.html');
    const existing = await chrome.tabs.query({ url });
    if (existing[0]?.id) {
      await chrome.tabs.update(existing[0].id, { active: true });
      if (existing[0].windowId) await chrome.windows.update(existing[0].windowId, { focused: true });
      return;
    }
    await chrome.tabs.create({ url, active: true });
  };

  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create('tabflow-auto-snapshot', { periodInMinutes: 30, delayInMinutes: 2 });
    createSnapshot().catch(console.error);
  });

  chrome.runtime.onStartup.addListener(() => {
    createSnapshot().catch(console.error);
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'tabflow-auto-snapshot') createSnapshot().catch(console.error);
  });

  chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId).then(rememberSaveableTab).catch(() => undefined);
  });

  chrome.tabs.onUpdated.addListener((_tabId, _changeInfo, tab) => {
    rememberSaveableTab(tab);
  });

  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) rememberActiveTab().catch(console.error);
  });

  chrome.commands.onCommand.addListener((command) => {
    if (command === 'open-dashboard') openDashboard().catch(console.error);
  });

  chrome.runtime.onMessage.addListener((message: TabFlowMessage, _sender, sendResponse) => {
    (async () => {
      switch (message.type) {
        case 'SAVE_TABS':
          return saveTabsFromBrowser(message.payload.source, message.payload);
        case 'RESTORE_GROUP':
          return restoreGroup(message.payload.groupId, message.payload.mode);
        case 'DELETE_GROUP':
          await actions.deleteGroup(message.payload.groupId);
          return { ok: true };
        case 'RESTORE_DELETED_GROUP':
          await actions.restoreDeletedGroup(message.payload.groupId);
          return { ok: true };
        case 'IMPORT_BOOKMARKS':
          return importBookmarks();
        case 'CREATE_SNAPSHOT':
          return createSnapshot();
        case 'EXPORT_GROUP':
          return exportSavedGroup(message.payload.groupId, message.payload.format);
        case 'GET_DASHBOARD_DATA':
          return getDashboardData();
        case 'UPDATE_GROUP':
          await actions.updateGroup(message.payload.groupId, message.payload);
          return { ok: true };
        case 'DELETE_TAB':
          await actions.deleteTab(message.payload.tabId);
          return { ok: true };
        case 'REORDER_TABS':
          await actions.reorderTabs(message.payload.groupId, message.payload.orderedTabIds);
          return { ok: true };
        case 'ADD_TODO':
          await actions.addTodo(message.payload.groupId, message.payload.text);
          return { ok: true };
        case 'TOGGLE_TODO':
          await actions.updateTodo(message.payload.todoId, { done: message.payload.done });
          return { ok: true };
        case 'DELETE_TODO':
          await actions.deleteTodo(message.payload.todoId);
          return { ok: true };
        case 'UPDATE_SETTINGS':
          return actions.updateSettings(message.payload);
        default:
          return { ok: false, error: '未知消息' };
      }
    })()
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || String(error) }));
    return true;
  });
});
