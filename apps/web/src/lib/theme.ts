export type Theme = 'light' | 'dark' | 'system';

export function applyTheme(t: Theme): void {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = t;
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
  try { localStorage.setItem('wf-theme', t); } catch { /* private mode */ }
}

export function currentTheme(): Theme {
  return (document.documentElement.dataset.theme as Theme) || 'system';
}

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (currentTheme() === 'system') applyTheme('system');
});
