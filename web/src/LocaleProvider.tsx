import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { readLocale, translate, writeLocale, type Key, type Locale } from './i18n'
import { setApiLocale } from './api'

interface Ctx {
  locale: Locale
  setLocale: (l: Locale) => void
  t: (key: Key, vars?: Record<string, string | number>) => string
  /** Tiempo relativo ya localizado: «hace 3 horas» / «3 hours ago». */
  rel: (iso: string) => string
}

const LocaleCtx = createContext<Ctx | null>(null)

const UNITS: [limit: number, seconds: number, unit: Intl.RelativeTimeFormatUnit][] = [
  [60, 1, 'second'],
  [3600, 60, 'minute'],
  [86400, 3600, 'hour'],
  [2592000, 86400, 'day'],
  [31536000, 2592000, 'month'],
  [Infinity, 31536000, 'year'],
]

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const l = readLocale()
    document.documentElement.lang = l
    return l
  })

  const setLocale = useCallback((l: Locale) => {
    writeLocale(l)
    setLocaleState(l)
  }, [])

  // El cliente HTTP produce dos mensajes propios y no puede usar el hook.
  useEffect(() => setApiLocale(locale), [locale])

  const value = useMemo<Ctx>(() => {
    // Intl evita mantener un catalogo de plurales y declinaciones por idioma,
    // que es justo la parte de traducir que mas se rompe.
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

    return {
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      rel: (iso) => {
        const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
        for (const [limit, divisor, unit] of UNITS) {
          if (seconds < limit) return rtf.format(-Math.round(seconds / divisor), unit)
        }
        return rtf.format(-1, 'year')
      },
    }
  }, [locale, setLocale])

  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>
}

export function useT(): Ctx {
  const ctx = useContext(LocaleCtx)
  if (!ctx) throw new Error('useT fuera de LocaleProvider')
  return ctx
}
