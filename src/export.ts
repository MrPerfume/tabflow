import type { GroupWithTabs } from './types';

export function exportGroup(group: GroupWithTabs, format: 'markdown' | 'json'): string {
  if (format === 'json') {
    return JSON.stringify(
      {
        title: group.title,
        type: group.type,
        note: group.note ?? '',
        exportedAt: new Date().toISOString(),
        tabs: group.tabs.map(({ title, url }) => ({ title, url })),
        todos: group.todos.map(({ text, done }) => ({ text, done })),
      },
      null,
      2,
    );
  }

  const lines = [`# ${group.title}`, ''];
  if (group.note) lines.push(group.note, '');
  lines.push('## 标签');
  group.tabs.forEach((tab, index) => lines.push(`${index + 1}. [${tab.title || tab.url}](${tab.url})`));
  if (group.todos.length) {
    lines.push('', '## TODO');
    group.todos.forEach((todo) => lines.push(`- [${todo.done ? 'x' : ' '}] ${todo.text}`));
  }
  return lines.join('\n');
}
