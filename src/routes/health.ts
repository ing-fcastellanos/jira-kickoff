import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { FastifyPluginAsync } from 'fastify'
import type { AppConfig, ConfigStore } from '../config'

const run = promisify(execFile)

export interface ProjectHealth {
  key: string
  repo: string
  baseBranch: string
  enabled: boolean
  repoExists: boolean
  isGitRepo: boolean
}

export interface Health {
  ok: boolean
  problems: string[]
  jira: { site: string; credentialsConfigured: boolean; email: string | null }
  git: { available: boolean; version: string | null }
  projects: ProjectHealth[]
}

async function gitVersion(): Promise<string | null> {
  try {
    const { stdout } = await run('git', ['--version'])
    return stdout.trim()
  } catch {
    return null
  }
}

function inspectProjects(config: AppConfig): ProjectHealth[] {
  return Object.entries(config.projects).map(([key, project]) => {
    const repoExists = existsSync(project.repo)
    return {
      key,
      repo: project.repo,
      baseBranch: project.baseBranch,
      enabled: project.enabled,
      repoExists,
      // In a worktree .git is a file, in the main repo a directory.
      isGitRepo: repoExists && existsSync(join(project.repo, '.git')),
    }
  })
}

export function buildHealth(config: AppConfig, git: string | null): Health {
  const projects = inspectProjects(config)
  const credentialsConfigured = Boolean(config.jiraEmail && config.jiraToken)
  const problems: string[] = []

  if (!credentialsConfigured) {
    problems.push('Faltan JIRA_EMAIL o JIRA_API_TOKEN en .env')
  }
  if (!git) {
    problems.push('git no esta disponible en el PATH')
  }
  // A disabled project with a broken path does not block working on the rest.
  for (const p of projects.filter((p) => p.enabled)) {
    if (!p.repoExists) problems.push(`${p.key}: la ruta ${p.repo} no existe`)
    else if (!p.isGitRepo) problems.push(`${p.key}: ${p.repo} no es un repositorio git`)
  }
  if (projects.every((p) => !p.enabled)) {
    problems.push('No hay ningun proyecto activo. Activa alguno en Opciones.')
  }

  return {
    ok: problems.length === 0,
    problems,
    jira: { site: config.jira.site, credentialsConfigured, email: config.jiraEmail },
    git: { available: Boolean(git), version: git },
    projects,
  }
}

export const healthRoutes: FastifyPluginAsync<{ store: ConfigStore }> = async (app, opts) => {
  app.get('/api/health', async () => buildHealth(opts.store.get(), await gitVersion()))
}
