import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: '__MSG_extensionName__',
    description: '__MSG_extensionDescription__',
    version: '0.1.0',
    default_locale: 'zh_CN',
    permissions: ['tabs', 'tabGroups', 'storage', 'unlimitedStorage', 'alarms'],
    optional_permissions: ['bookmarks'],
    action: {
      default_title: '__MSG_extensionName__',
      default_popup: 'popup.html',
    },
    options_ui: {
      page: 'options.html',
      open_in_tab: true,
    },
    commands: {
      'open-dashboard': {
        description: '打开 TabFlow 控制台',
        suggested_key: {
          default: 'Alt+Shift+F',
        },
      },
    },
  },
});
