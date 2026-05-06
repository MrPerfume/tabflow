# TabFlow

TabFlow 是一个本地优先的 Chrome MV3 标签页管理扩展，使用 WXT、Vue 和 TypeScript 构建。它面向“稍后再看”和“浏览现场收纳”场景，把当前标签、窗口、Chrome 标签组和自动快照保存到本地 IndexedDB，之后可以从 Dashboard 快速搜索、整理和恢复。

## 功能

- 保存当前标签、当前窗口、当前标签组，并默认关闭原标签以释放内存
- 恢复时默认激活第一个标签，并按站点自动创建 Chrome 原生标签组
- 自动快照当前浏览现场，支持浏览器重启后快速恢复
- Dashboard 管理会话、快照、书签导入、备注和 TODO
- 相同站点标签自动聚合，可一键展开或收起
- 搜索标题、备注和 URL，搜索命中时自动展开对应站点分组
- 最近删除入口，可恢复误删会话
- 书签导入，触发时申请 `bookmarks` 可选权限
- 复制 Markdown/JSON 分享内容

## 技术栈

- Chrome Manifest V3
- WXT
- Vue 3
- TypeScript
- IndexedDB
- pnpm

## 开发

安装依赖：

```bash
pnpm install
```

启动开发模式：

```bash
pnpm dev
```

生产构建：

```bash
pnpm build
```

类型检查：

```bash
pnpm typecheck
```

## 加载扩展

构建后，在 Chrome 打开 `chrome://extensions`：

1. 开启「开发者模式」
2. 点击「加载已解压的扩展程序」
3. 选择 `.output/chrome-mv3`

如果你需要一个非隐藏目录用于选择，可以把 `.output/chrome-mv3` 同步到本地临时目录，但不要提交构建产物。

## 数据与隐私

TabFlow v1 不包含账号、云同步、订阅或公开分享后端。会话、标签、备注、TODO、快照和设置都保存在浏览器本地。

## 权限说明

- `tabs` / `tabGroups`：保存、恢复和分组标签页
- `storage` / `unlimitedStorage`：本地保存设置和数据
- `alarms`：定时创建自动快照
- `bookmarks`：仅在用户触发书签导入时申请
