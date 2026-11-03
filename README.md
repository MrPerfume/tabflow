# TabFlow

TabFlow 是一个本地优先的 Chrome 标签页管理扩展，用于保存、搜索和恢复浏览现场。把暂时看不完的标签收进会话，之后从 Dashboard 按标题、备注或网址找到它们，恢复时按站点整理为 Chrome 标签组。

## 使用示例

一次资料整理打开了多个文档和参考网页，可以这样收纳：

1. **保存浏览现场**：保存当前窗口或标签组，为会话添加备注；默认会关闭已保存的原标签。
2. **搜索与整理**：在 Dashboard 搜索标题、备注或 URL，按站点查看标签，为待处理内容添加 TODO。
3. **恢复会话**：重新打开需要的会话，默认激活第一个标签，并按站点创建 Chrome 标签组。

自动快照可用于浏览器重启后的恢复；误删会话可从“最近删除”找回。

## 首次使用

当前需从源码构建后加载扩展。准备 Node.js 和 pnpm，在仓库根目录执行：

```bash
pnpm install
pnpm build
```

在 Chrome 打开 `chrome://extensions`，开启「开发者模式」，点击「加载已解压的扩展程序」，选择 `.output/chrome-mv3`。

如果目录选择器隐藏 `.output`，可以把 `.output/chrome-mv3` 复制到本地临时目录后加载；构建产物和临时目录不提交到 Git。

## 功能与限制

- 保存当前标签、当前窗口、当前标签组，并默认关闭原标签以释放内存
- 恢复时默认激活第一个标签，并按站点自动创建 Chrome 原生标签组
- 自动快照当前浏览现场，支持浏览器重启后快速恢复
- Dashboard 按会话、Chrome 标签组、快照、书签导入分类管理，支持备注和 TODO
- 相同站点标签自动聚合，可一键展开或收起
- 搜索标题、备注和 URL，搜索命中时自动展开对应站点分组
- 最近删除入口，可恢复误删会话
- 书签导入，触发时申请 `bookmarks` 可选权限
- 复制 Markdown/JSON 分享内容

- 数据保存在本地 IndexedDB；v1 不包含账号、云同步、订阅或公开分享后端。
- Markdown/JSON 导出用于复制和分享内容，分享前需自行检查标题、网址与备注。

### 数据与权限

会话、标签、备注、TODO、快照和设置均保存在浏览器本地。

- `tabs` / `tabGroups`：保存、恢复和分组标签页。
- `storage` / `unlimitedStorage`：本地保存设置和数据。
- `alarms`：定时创建自动快照。
- `bookmarks`：仅在用户触发书签导入时申请。

## 开发说明

使用 Chrome Manifest V3、WXT、Vue 3、TypeScript、IndexedDB 和 pnpm。

安装依赖后启动开发模式：

```bash
pnpm dev
```

另开终端执行类型检查，或生成生产构建：

```bash
pnpm typecheck
pnpm build
```
