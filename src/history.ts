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
 * Entry cap. This is a convenience record, not a logbook: past a certain point
 * the old entries add nothing and only grow the file.
 */
const MAX_ENTRIES = 500

export interface TicketHistory {
  lastInitializedAt: string
  lastBranch: string
  times: number
}

/**
 * Record of initializations.
 *
 * It complements git, it does not replace it: whether a worktree exists right
 * now is answered by git, which cannot fall out of sync. This answers what git
 * has already forgotten — that a ticket was initialized and its worktree cleaned
 * up afterwards.
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
    // Next to the configuration, not next to the code: with `npx` the package
    // lives in a temporary cache and the history would be lost on every run.
    const path = join(configDir(), 'history.json')
    if (!existsSync(path)) return new HistoryStore(path, [])

    try {
      const parsed = fileSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
      // A corrupt history must not block working: it starts from scratch.
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

  /** Summary per ticket, which is how the list consumes it. */
  byTicket(): Record<string, TicketHistory> {
    const out: Record<string, TicketHistory> = {}
    // Entries go from newest to oldest: the first one for each ticket is the
    // last time it was initialized.
    for (const e of this.entries) {
      const current = out[e.ticketKey]
      if (current) current.times += 1
      else out[e.ticketKey] = { lastInitializedAt: e.at, lastBranch: e.branch, times: 1 }
    }
    return out
  }
}
