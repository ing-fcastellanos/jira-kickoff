import { useCallback, useState } from 'react'
import type { FileConfig, SetupState } from './types'
import { getJson, postJson, putJson } from './api'
import { Button, Field, Note, inputClass, monoInputClass } from './ui'
import { useT } from './LocaleProvider'

const TOKEN_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens'

function Step({
  title,
  done,
  doneLabel,
  children,
}: {
  title: string
  done: boolean
  doneLabel: string
  children?: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-3 border-b border-line-soft py-5 last:border-b-0">
      <h2 className="text-[15px] font-semibold text-ink">
        <span className="syntax">## </span>
        {title}
        {done && <span className="ml-2 text-[12.5px] font-normal text-ok">{doneLabel}</span>}
      </h2>
      {children}
    </section>
  )
}

/**
 * Primer arranque.
 *
 * Ejecutado con `npx` no hay repositorio que clonar ni archivos que editar a
 * mano, asi que la configuracion minima —credenciales y un proyecto— se pide
 * aqui. El token se valida contra Jira antes de escribirlo: dejarlo en disco y
 * fallar despues obligaria al usuario a adivinar por que no ve nada.
 */
export default function Onboarding({ state, onReady }: { state: SetupState; onReady: () => void }) {
  const { t } = useT()
  const [site, setSite] = useState(state.site)
  const [email, setEmail] = useState(state.email ?? '')
  const [token, setToken] = useState('')
  const [savingCreds, setSavingCreds] = useState(false)
  const [credsError, setCredsError] = useState<string | null>(null)
  const [greeting, setGreeting] = useState<string | null>(null)

  const [projectKey, setProjectKey] = useState('')
  const [repo, setRepo] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [savingProject, setSavingProject] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)

  const credsDone = Boolean(greeting) || (state.hasCredentials && Boolean(state.site))

  const saveCredentials = useCallback(async () => {
    setSavingCreds(true)
    setCredsError(null)
    try {
      const r = await postJson<{ displayName: string; site: string }>('/api/setup/credentials', {
        site,
        email,
        token,
      })
      setGreeting(r.displayName)
      setSite(r.site)
      setToken('')
    } catch (err) {
      setCredsError((err as Error).message)
    } finally {
      setSavingCreds(false)
    }
  }, [site, email, token])

  const saveProject = useCallback(async () => {
    setSavingProject(true)
    setProjectError(null)
    try {
      // Se relee la configuracion en vez de reconstruirla: el asistente no debe
      // pisar lo que el propio servidor acaba de guardar en el paso anterior.
      const current = await getJson<{ config: FileConfig }>('/api/settings')
      const key = projectKey.trim().toUpperCase()
      await putJson('/api/settings', {
        ...current.config,
        projects: {
          ...current.config.projects,
          [key]: { repo: repo.trim(), baseBranch: baseBranch.trim(), enabled: true },
        },
      })
      onReady()
    } catch (err) {
      setProjectError((err as Error).message)
    } finally {
      setSavingProject(false)
    }
  }, [projectKey, repo, baseBranch, onReady])

  return (
    <div className="min-h-screen px-6 pt-12 pb-20">
      <div className="mx-auto flex max-w-[620px] flex-col gap-2">
        <h1 className="text-[25px] font-semibold tracking-tight text-ink">
          <span className="syntax"># </span>
          {t('onb.title')}
        </h1>
        <p className="text-[13px] text-ink-5">
          {t('onb.intro')}{' '}
          <span className="font-mono break-all text-ok">{state.paths.config}</span>.
        </p>

        <div className="mt-3 rounded-xl border border-line bg-raised px-5">
          <Step title={t('onb.step1')} done={credsDone} doneLabel={t('onb.stepDone')}>
            {credsDone ? (
              <Note tone="ok" title={t('onb.connectedAs', { name: greeting ?? state.email ?? '' })}>
                {t('onb.tokenStored')}{' '}
                <span className="font-mono break-all">{state.paths.credentials}</span>
              </Note>
            ) : (
              <>
                <Field label={t('onb.site')}>
                  <input
                    value={site}
                    onChange={(e) => setSite(e.target.value)}
                    placeholder="your-domain.atlassian.net"
                    spellCheck={false}
                    className={inputClass}
                  />
                </Field>
                <Field label={t('onb.email')}>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    spellCheck={false}
                    className={inputClass}
                  />
                </Field>
                <Field
                  label={t('onb.token')}
                  hint={
                    <>
                      {t('onb.tokenHint')}{' '}
                      <a
                        href={TOKEN_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent hover:underline"
                      >
                        id.atlassian.com
                      </a>
                    </>
                  }
                >
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    spellCheck={false}
                    className={monoInputClass}
                  />
                </Field>

                {credsError && <Note tone="danger">{credsError}</Note>}

                <Button
                  variant="primary"
                  className="self-start"
                  disabled={!site.trim() || !email.trim() || !token.trim() || savingCreds}
                  onClick={() => void saveCredentials()}
                >
                  {savingCreds ? t('onb.checking') : t('onb.check')}
                </Button>
              </>
            )}
          </Step>

          <Step title={t('onb.step2')} done={false} doneLabel={t('onb.stepDone')}>
            <p className="text-[12.5px] leading-relaxed text-ink-5">{t('onb.projectHint')}</p>

            <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
              <Field label={t('onb.key')}>
                <input
                  value={projectKey}
                  onChange={(e) => setProjectKey(e.target.value.toUpperCase())}
                  placeholder="ABC"
                  spellCheck={false}
                  className={monoInputClass}
                />
              </Field>
              <Field label={t('onb.repo')}>
                <input
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  placeholder={t('set.repoPlaceholder')}
                  spellCheck={false}
                  className={monoInputClass}
                />
              </Field>
            </div>
            <Field label={t('onb.baseBranch')}>
              <input
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                spellCheck={false}
                className={monoInputClass}
              />
            </Field>

            {projectError && <Note tone="danger">{projectError}</Note>}

            <Button
              variant="primary"
              className="self-start"
              disabled={
                !credsDone ||
                !projectKey.trim() ||
                !repo.trim() ||
                !baseBranch.trim() ||
                savingProject
              }
              onClick={() => void saveProject()}
            >
              {savingProject ? t('common.saving') : t('onb.start')}
            </Button>
            {!credsDone && <p className="text-[11.5px] text-ink-6">{t('onb.connectFirst')}</p>}
          </Step>
        </div>
      </div>
    </div>
  )
}
