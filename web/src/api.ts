import { translate, type Key, type Locale } from './i18n'

/*
 * The HTTP client is not a component, so it cannot use the language hook.
 * Instead of dragging the locale through every call, the provider registers the
 * active language here: the two strings this module produces come out translated
 * without a single signature changing.
 */
let locale: Locale = 'en'
export function setApiLocale(next: Locale): void {
  locale = next
}
const t = (key: Key, vars?: Record<string, string | number>) => translate(locale, key, vars)

/**
 * The language chosen in Options travels on every request.
 *
 * Without this the server would answer in the browser's language, which may not
 * be the one the user picked: choosing Spanish with Chrome in English would give
 * a Spanish interface with English errors.
 */
function headers(extra?: Record<string, string>): Record<string, string> {
  return { 'Accept-Language': locale, ...extra }
}

/** The server returns `{ error }` on failures; that text already reads as prose. */
export async function getJson<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { headers: headers() })
  } catch {
    throw new Error(t('common.noConnection'))
  }
  return unwrap<T>(res)
}

export async function postJson<T>(url: string, payload: unknown): Promise<T> {
  return sendJson<T>('POST', url, payload)
}

export async function putJson<T>(url: string, payload: unknown): Promise<T> {
  return sendJson<T>('PUT', url, payload)
}

async function sendJson<T>(method: string, url: string, payload: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error(t('common.noConnection'))
  }
  return unwrap<T>(res)
}

async function unwrap<T>(res: Response): Promise<T> {
  const body: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : t('common.serverSaid', { status: res.status })
    throw new Error(message)
  }

  return body as T
}
