export function createId(prefix = 'tf'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

export function isSaveableUrl(url?: string): url is string {
  if (!url) return false;
  return /^(https?|file):\/\//i.test(url);
}

export function formatDateTime(time: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
}

const MULTI_PART_PUBLIC_SUFFIXES = new Set([
  'ac.uk',
  'co.in',
  'co.jp',
  'co.kr',
  'co.nz',
  'co.uk',
  'com.au',
  'com.br',
  'com.cn',
  'com.hk',
  'com.mx',
  'com.sg',
  'com.tr',
  'com.tw',
  'firm.in',
  'gen.in',
  'gov.cn',
  'gov.uk',
  'ind.in',
  'ne.jp',
  'net.au',
  'net.cn',
  'net.in',
  'or.jp',
  'org.au',
  'org.cn',
  'org.in',
  'org.uk',
]);

export function getSiteKey(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    if (!hostname) return 'local';
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname === 'localhost') return hostname;
    const parts = hostname.split('.').filter(Boolean);
    if (parts.length <= 2) return hostname || 'local';
    const publicSuffix = parts.slice(-2).join('.');
    if (MULTI_PART_PUBLIC_SUFFIXES.has(publicSuffix) && parts.length >= 3) return parts.slice(-3).join('.');
    return parts.slice(-2).join('.');
  } catch {
    return 'local';
  }
}

export function getSiteLabel(url: string): string {
  const site = getSiteKey(url);
  return site === 'local' ? '本地页面' : site;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
