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
    icons: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
    action: {
      default_title: '__MSG_extensionName__',
      default_popup: 'popup.html',
      default_icon: {
        16: 'icon-16.png',
        32: 'icon-32.png',
        48: 'icon-48.png',
        128: 'icon-128.png',
      },
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
