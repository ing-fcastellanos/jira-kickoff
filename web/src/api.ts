import { translate, type Key, type Locale } from './i18n'

/*
 * El cliente HTTP no es un componente, asi que no puede usar el hook de idioma.
 * En vez de arrastrar el locale por cada llamada, el proveedor registra aqui el
 * idioma activo: las dos cadenas que este modulo produce salen traducidas sin
 * que ninguna firma cambie.
 */
let locale: Locale = 'en'
export function setApiLocale(next: Locale): void {
  locale = next
}
const t = (key: Key, vars?: Record<string, string | number>) => translate(locale, key, vars)

/**
 * El idioma elegido en Opciones viaja en cada peticion.
 *
 * Sin esto el servidor responderia en el idioma del navegador, que puede no ser
 * el que el usuario escogio: elegir espanol con Chrome en ingles daria una
 * interfaz en espanol con errores en ingles.
 */
function headers(extra?: Record<string, string>): Record<string, string> {
  return { 'Accept-Language': locale, ...extra }
}

/** El servidor devuelve `{ error }` en los fallos; ese texto ya viene redactado para leerse. */
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
