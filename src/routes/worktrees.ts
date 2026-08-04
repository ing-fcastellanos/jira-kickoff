import { resolve, sep } from 'node:path'
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { ConfigStore } from '../config'
import type { WorktreeInfo, WorktreesResponse } from '../types'
import { GitError } from '../git'
import { EditorError, openInEditor } from '../editor'
import {
  branchIsMerged,
  deleteBranch,
  isDirty,
  listWorktrees,
  pruneWorktrees,
  remoteBranchExists,
  removeWorktree,
  unpushedCount,
} from '../worktree'
import { langOf, replyWithError, say } from './errors'
import { message } from '../messages'

const openEditorBody = z.object({
  projectKey: z.string().min(1),
  path: z.string().min(1),
})

const removeBody = z.object({
  projectKey: z.string().min(1),
  path: z.string().min(1),
  /** Required when there are uncommitted changes or unpushed commits. */
  force: z.boolean().default(false),
  deleteBranch: z.boolean().default(false),
})

/**
 * Only what is inside the project's worktree folder can be touched.
 * Without this check, a tampered `path` would delete any folder on the disk.
 */
function isInsideWorktreeDir(repo: string, worktreesDir: string, candidate: string): boolean {
  const root = resolve(repo, worktreesDir)
  const target = resolve(candidate)
  return target.toLowerCase().startsWith(root.toLowerCase() + sep) && target.length > root.length + 1
}

export const worktreeRoutes: FastifyPluginAsync<{ store: ConfigStore }> = async (app, opts) => {
  const { store } = opts

  app.get('/api/worktrees', async () => {
    const config = store.get()
    const errors: WorktreesResponse['errors'] = []

    const perProject = await Promise.all(
      Object.entries(config.projects).map(async ([projectKey, project]) => {
        try {
          const entries = await listWorktrees(project.repo)
          const mainPath = resolve(project.repo)

          return await Promise.all(
            entries.map(async (entry): Promise<WorktreeInfo> => {
              const path = resolve(entry.path)
              const isMain = path.toLowerCase() === mainPath.toLowerCase()
              const managed = isInsideWorktreeDir(project.repo, config.worktrees.dir, path)
              const branch = entry.branch

              const base = {
                projectKey,
                repo: project.repo,
                path,
                name: path.split(sep).pop() ?? path,
                branch,
                managed: managed && !isMain,
                isMain,
              }

              // The main worktree is not inspected: it is a candidate for nothing.
              if (isMain) {
                return { ...base, dirty: false, unpushed: 0, remoteBranchExists: false, merged: false }
              }

              // A worktree in detached HEAD has no branch to compare, but it can
              // have unsaved work: that has to be looked at all the same.
              const dirty = await isDirty(path).catch(() => false)
              if (!branch) {
                return { ...base, dirty, unpushed: 0, remoteBranchExists: false, merged: false }
              }

              const [hasRemote, merged] = await Promise.all([
                remoteBranchExists(project.repo, branch).catch(() => false),
                branchIsMerged(project.repo, branch, project.baseBranch).catch(() => false),
              ])

              const unpushed = await unpushedCount(path, branch, project.baseBranch, hasRemote)

              return { ...base, dirty, unpushed, remoteBranchExists: hasRemote, merged }
            }),
          )
        } catch (err) {
          errors.push({
            projectKey,
            error: err instanceof GitError ? err.message : String(err),
          })
          return []
        }
      }),
    )

    const payload: WorktreesResponse = {
      worktrees: perProject.flat(),
      errors,
      editorLabel: config.editor.label,
      fetchedAt: new Date().toISOString(),
    }
    return payload
  })

  app.post('/api/worktrees/open-editor', async (req, reply) => {
    const parsed = openEditorBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      })
    }
    const { projectKey, path } = parsed.data

    const config = store.get()
    const project = config.projects[projectKey]
    if (!project) {
      return reply.status(400).send({ error: say(reply, 'err.projectNotConfigured', { project: projectKey }) })
    }

    // Same lock as deleting: only what is inside the worktree folder is opened.
    // Without this, the editor could be launched on any path on the disk that
    // arrives in the request.
    if (!isInsideWorktreeDir(project.repo, config.worktrees.dir, path)) {
      return reply.status(400).send({
        error: say(reply, 'err.outsideWorktrees', { path, project: projectKey }),
      })
    }

    try {
      await openInEditor(config.editor.command, config.editor.args, resolve(path))
      return { opened: path, editor: config.editor.label }
    } catch (err) {
      return replyWithError(reply, err)
    }
  })

  app.post('/api/worktrees/remove', async (req, reply) => {
    const parsed = removeBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      })
    }
    const { projectKey, path, force, deleteBranch: alsoBranch } = parsed.data

    const config = store.get()
    const project = config.projects[projectKey]
    if (!project) {
      return reply.status(400).send({ error: say(reply, 'err.projectNotConfigured', { project: projectKey }) })
    }

    if (!isInsideWorktreeDir(project.repo, config.worktrees.dir, path)) {
      return reply.status(400).send({
        error: say(reply, 'err.outsideWorktrees', { path, project: projectKey }),
      })
    }

    try {
      const entry = (await listWorktrees(project.repo)).find(
        (w) => resolve(w.path).toLowerCase() === resolve(path).toLowerCase(),
      )
      if (!entry) {
        return reply.status(404).send({ error: say(reply, 'err.worktreeUnknown', { path }) })
      }

      const branch = entry.branch

      // No branch is not taken as safe either: a detached HEAD can have live work.
      if (!force) {
        const dirty = await isDirty(path).catch(() => false)
        let unpushed = 0
        if (branch) {
          const hasRemote = await remoteBranchExists(project.repo, branch).catch(() => false)
          unpushed = await unpushedCount(path, branch, project.baseBranch, hasRemote)
        }

        if (dirty || unpushed > 0) {
          const lang = langOf(reply)
          const what = [
            dirty ? message(lang, 'err.losesUncommitted') : null,
            unpushed > 0 ? message(lang, 'err.losesUnpushed', { n: unpushed }) : null,
          ]
            .filter(Boolean)
            .join(' + ')
          return reply.status(409).send({
            error: message(lang, 'err.worktreeHasWork', { what }),
            needsForce: true,
          })
        }
      }

      await removeWorktree(project.repo, path, force)

      let branchDeleted = false
      if (alsoBranch && branch) {
        await deleteBranch(project.repo, branch)
        branchDeleted = true
      }

      await pruneWorktrees(project.repo)
      return { removed: path, branch, branchDeleted }
    } catch (err) {
      return replyWithError(reply, err)
    }
  })
}
