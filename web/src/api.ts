/** El servidor devuelve `{ error }` en los fallos; ese texto ya viene redactado para leerse. */
export async function getJson<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url)
  } catch {
    throw new Error('No pude hablar con el servicio local. ¿Está corriendo `npm run dev`?')
  }

  const body: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `El servidor respondió ${res.status}`
    throw new Error(message)
  }

  return body as T
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error('No pude hablar con el servicio local. ¿Está corriendo `npm run dev`?')
  }

  const body: unknown = await res.json().catch(() => null)

  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `El servidor respondió ${res.status}`
    throw new Error(message)
  }

  return body as T
}

const UNITS: [limit: number, seconds: number, singular: string, plural: string][] = [
  [60, 1, 'segundo', 'segundos'],
  [3600, 60, 'minuto', 'minutos'],
  [86400, 3600, 'hora', 'horas'],
  [2592000, 86400, 'día', 'días'],
  [31536000, 2592000, 'mes', 'meses'],
  [Infinity, 31536000, 'año', 'años'],
]

export function relativeTime(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 45) return 'hace un momento'

  for (const [limit, divisor, singular, plural] of UNITS) {
    if (seconds < limit) {
      const n = Math.round(seconds / divisor)
      return `hace ${n} ${n === 1 ? singular : plural}`
    }
  }
  return 'hace mucho'
}
