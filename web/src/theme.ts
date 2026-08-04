export type Theme = 'light' | 'dark' | 'system'

const KEY = 'jtw.theme'

export function readTheme(): Theme {
  const stored = localStorage.getItem(KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * The theme is a browser preference, not a project one: it lives in localStorage
 * and not in config.json, so that two machines can see it differently.
 */
export function applyTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme)
  const dark = theme === 'dark' || (theme === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

/** With the theme on `system`, system changes have to be followed live. */
export function watchSystemTheme(getTheme: () => Theme): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (getTheme() === 'system') applyTheme('system')
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
