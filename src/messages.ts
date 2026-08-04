/**
 * Server messages that end up on the user's screen.
 *
 * The errors are thrown in git, in Jira or while validating, far away from the
 * request that caused them, so they cannot be translated where they are born:
 * they travel as a key plus variables and are resolved at the HTTP edge, which
 * is the only point that knows the client's language.
 */

export const enMessages = {
  'err.credentials': 'Jira rejected the credentials: check the email and the token.',
  'err.unreachable': 'Could not reach {site}: {detail}',
  'err.jiraStatus': 'Jira responded {status}',
  'err.missingCredentials': 'Jira credentials are missing. Set them up in the panel.',
  'err.noProjects': 'No project is active. Enable one in Settings.',
  'err.gitTimeout': '`git {command}` took longer than {seconds}s and was cancelled.',
  'err.ticketNotFound': '{ticket} is not among your open tickets.',
  'err.projectNotConfigured': 'Project {project} is not configured.',
  'err.invalidBranch': '"{branch}" is not a valid branch name.',
  'err.urlTooLong':
    'The prompt produces a {length}-character URL, over the command line limit. Shorten it and try again. The worktree is already created at {worktree}.',
  'err.worktreeOtherBranch':
    'There is already a worktree at {path} on branch "{branch}". Pick that branch to resume it, or remove it with `git worktree remove`.',
  'err.worktreeOrphanFolder':
    'The folder {path} exists but git does not know it as a worktree. Delete it or run `git worktree prune` in {repo}.',
  'err.branchInUse':
    'Branch "{branch}" is already used by worktree {path}. Git does not allow the same branch in two worktrees.',
  'err.outsideWorktrees': '{path} is outside the worktrees folder of {project}. Not touching it.',
  'err.worktreeUnknown': 'git does not know any worktree at {path}.',
  'err.worktreeHasWork': 'It has {what}. They would be lost.',
  'err.losesUncommitted': 'uncommitted changes',
  'err.losesUnpushed': '{n} unpushed commit(s)',
  'err.editorFailed': 'Could not run "{command}": {detail}',
  'err.editorExit': '"{command}" exited with code {code}. Is it on your PATH?',
  'err.configMissing': 'The configuration has errors:\n{detail}',
  'err.notJson': '{path} is not valid JSON: {detail}',
  'err.badPort': 'PORT="{value}" is not an integer.',
  'err.badSite': '"{site}" is not a valid address.',
  'err.checkFailed': 'Could not verify the credentials: {detail}',
  'err.portsBusy': 'Ports {from}–{to} are busy. Free one or set PORT.',
} as const

export type MessageKey = keyof typeof enMessages

const esMessages: Record<MessageKey, string> = {
  'err.credentials': 'Jira rechazó las credenciales: comprueba el correo y el token.',
  'err.unreachable': 'No pude alcanzar {site}: {detail}',
  'err.jiraStatus': 'Jira respondió {status}',
  'err.missingCredentials': 'Faltan las credenciales de Jira. Configúralas en el panel.',
  'err.noProjects': 'No hay ningún proyecto activo. Activa alguno en Opciones.',
  'err.gitTimeout': '`git {command}` excedió {seconds}s y fue cancelado.',
  'err.ticketNotFound': '{ticket} no está entre tus tickets abiertos.',
  'err.projectNotConfigured': 'El proyecto {project} no está configurado.',
  'err.invalidBranch': '"{branch}" no es un nombre de rama válido.',
  'err.urlTooLong':
    'El prompt genera una URL de {length} caracteres, por encima del límite de la línea de comandos. Acórtalo y vuelve a intentarlo. El worktree ya quedó creado en {worktree}.',
  'err.worktreeOtherBranch':
    'Ya hay un worktree en {path} sobre la rama "{branch}". Elige esa rama para retomarlo, o quítalo con `git worktree remove`.',
  'err.worktreeOrphanFolder':
    'La carpeta {path} existe pero git no la conoce como worktree. Bórrala o ejecuta `git worktree prune` en {repo}.',
  'err.branchInUse':
    'La rama "{branch}" ya está usada por el worktree {path}. Git no permite la misma rama en dos worktrees.',
  'err.outsideWorktrees': '{path} está fuera de la carpeta de worktrees de {project}. No se toca.',
  'err.worktreeUnknown': 'git no conoce ningún worktree en {path}.',
  'err.worktreeHasWork': 'Tiene {what}. Se perderían.',
  'err.losesUncommitted': 'cambios sin commitear',
  'err.losesUnpushed': '{n} commit(s) sin subir',
  'err.editorFailed': 'No pude ejecutar "{command}": {detail}',
  'err.editorExit': '"{command}" terminó con código {code}. ¿Está en el PATH?',
  'err.configMissing': 'La configuración tiene errores:\n{detail}',
  'err.notJson': '{path} no es JSON válido: {detail}',
  'err.badPort': 'PORT="{value}" no es un entero.',
  'err.badSite': '"{site}" no es una dirección válida.',
  'err.checkFailed': 'No pude comprobar las credenciales: {detail}',
  'err.portsBusy': 'Los puertos {from}–{to} están ocupados. Libera uno o define PORT.',
}

const CATALOGS = { en: enMessages, es: esMessages }
export type Lang = keyof typeof CATALOGS

export type Vars = Record<string, string | number>

export function message(lang: Lang, key: MessageKey, vars?: Vars): string {
  let out: string = CATALOGS[lang][key] ?? enMessages[key]
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      out = out.replaceAll(`{${name}}`, String(value))
    }
  }
  return out
}

/**
 * Language requested by the browser. Only the prefix is looked at: `es-419` and
 * `es-ES` share a catalogue, and being finer would promise a precision that is
 * not there.
 */
export function langFrom(acceptLanguage: string | undefined): Lang {
  return acceptLanguage?.trim().toLowerCase().startsWith('es') ? 'es' : 'en'
}

/**
 * An error that knows how to translate itself. Error's `message` is filled in
 * English so that logs and traces stay readable without request context.
 */
export class LocalizedError extends Error {
  constructor(
    readonly key: MessageKey,
    readonly vars?: Vars,
    readonly status = 400,
  ) {
    super(message('en', key, vars))
  }

  localized(lang: Lang): string {
    return message(lang, this.key, this.vars)
  }
}

/**
 * An error whose text comes from outside —git's stderr, Jira's error body— and
 * is therefore not translated. Inventing a version in another language would
 * replace the real diagnostics with a paraphrase of ours.
 */
export class RawError extends LocalizedError {
  constructor(
    private readonly detail: string,
    status = 502,
  ) {
    super('err.jiraStatus', { status }, status)
  }

  override get message(): string {
    return this.detail
  }

  override localized(): string {
    return this.detail
  }
}
