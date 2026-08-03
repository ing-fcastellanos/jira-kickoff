import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { configDir } from './paths'

const entrySchema = z.object({
  ticketKey: z.string(),
  projectKey: z.string(),
  branch: z.string(),
  worktree: z.string(),
  at: z.string(),
  launchMode: z.enum(['open', 'clipboard']),
})

export type HistoryEntry = z.infer<typeof entrySchema>

const fileSchema = z.object({ entries: z.array(entrySchema).default([]) })

/**
 * Tope de entradas. Es un registro de conveniencia, no una bitacora: pasado
 * cierto punto lo viejo no aporta y solo hace crecer el archivo.
 */
const MAX_ENTRIES = 500

export interface TicketHistory {
  lastInitializedAt: string
  lastBranch: string
  times: number
}

/**
 * Registro de inicializaciones.
 *
 * Complementa a git, no lo sustituye: si un worktree existe ahora mismo lo dice
 * git, que no puede desincronizarse. Esto responde a lo que git ya olvido — que
 * un ticket se inicializo y su worktree se limpio despues.
 */
export class HistoryStore {
  private entries: HistoryEntry[]

  private constructor(
    private readonly path: string,
    entries: HistoryEntry[],
  ) {
    this.entries = entries
  }

  static load(): HistoryStore {
    // Junto a la configuracion, no junto al codigo: con `npx` el paquete vive
    // en una cache temporal y el historial se perderia en cada ejecucion.
    const path = join(configDir(), 'history.json')
    if (!existsSync(path)) return new HistoryStore(path, [])

    try {
      const parsed = fileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
      // Un historial corrupto no debe impedir trabajar: se empieza de cero.
      return new HistoryStore(path, parsed.success ? parsed.data.entries : [])
    } catch {
      return new HistoryStore(path, [])
    }
  }

  record(entry: HistoryEntry): void {
    this.entries = [entry, ...this.entries].slice(0, MAX_ENTRIES)

    mkdirSync(configDir(), { recursive: true })
    const tmp = `${this.path}.tmp`
    writeFileSync(tmp, `${JSON.stringify({ entries: this.entries }, null, 2)}\n`, 'utf8')
    renameSync(tmp, this.path)
  }

  /** Resumen por ticket, que es como lo consume la lista. */
  byTicket(): Record<string, TicketHistory> {
    const out: Record<string, TicketHistory> = {}
    // Las entradas van de mas reciente a mas antigua: la primera de cada
    // ticket es la ultima vez que se inicializo.
    for (const e of this.entries) {
      const current = out[e.ticketKey]
      if (current) current.times += 1
      else out[e.ticketKey] = { lastInitializedAt: e.at, lastBranch: e.branch, times: 1 }
    }
    return out
  }
}
