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
 * El tema es preferencia del navegador, no del proyecto: vive en localStorage y
 * no en config.json, para que dos maquinas puedan verlo distinto.
 */
export function applyTheme(theme: Theme): void {
  localStorage.setItem(KEY, theme)
  const dark = theme === 'dark' || (theme === 'system' && prefersDark())
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

/** Con el tema en `system` hay que seguir los cambios del sistema en vivo. */
export function watchSystemTheme(getTheme: () => Theme): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = () => {
    if (getTheme() === 'system') applyTheme('system')
  }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}
