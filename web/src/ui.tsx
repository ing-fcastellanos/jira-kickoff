import { useEffect } from 'react'

/**
 * Primitivas compartidas de la interfaz.
 *
 * Los cuatro modales repetian overlay, cierre con Escape, cabecera y botones.
 * Tenerlo en un sitio no es solo menos codigo: es lo que garantiza que las
 * cinco superficies sigan hablando el mismo idioma cuando cambie una.
 */

const VARIANTS = {
  /* Accion principal: lavanda solida, la unica pieza que llena de color. */
  primary: 'border-accent bg-accent text-accent-ink hover:bg-accent-hover hover:border-accent-hover',
  /* Accion secundaria de cabecera y formularios. */
  default: 'border-line bg-panel text-ink-3 hover:bg-control-hover hover:border-line-strong',
  /* Accion dentro de una tarjeta o fila, sobre fondo ya elevado. */
  quiet: 'border-line-strong bg-control text-ink-3 hover:bg-control-hover',
  /* Alternativa a primary cuando la accion no es la esperada. */
  outline: 'border-line-strong bg-transparent text-ink hover:bg-control',
  ghost: 'border-transparent bg-transparent text-ink-5 hover:bg-control-hover hover:text-ink',
  danger: 'border-danger bg-danger text-danger-ink hover:opacity-90',
  /*
   * Estados que en Tailwind no pueden lograrse sobrescribiendo la variante base
   * por className: al competir dos utilidades del mismo grupo gana la que salga
   * despues en el CSS generado, no la que se escriba despues en el atributo.
   */
  selected: 'border-accent bg-accent-soft font-semibold text-accent',
  warn: 'border-warn-line bg-transparent text-warn hover:bg-warn-bg',
} as const

export function Button({
  variant = 'default',
  className = '',
  ...props
}: React.ComponentProps<'button'> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button
      type="button"
      className={`cursor-pointer rounded-md border px-3 py-1.5 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

export const inputClass =
  'w-full rounded-md border border-line bg-input px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-6 focus:border-accent focus:outline-none'

export const monoInputClass = `${inputClass} font-mono`

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-semibold text-ink-4">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] leading-relaxed text-ink-5">{hint}</span>}
    </label>
  )
}

const NOTE_TONES = {
  ok: 'border-ok-line bg-ok-panel',
  warn: 'border-warn-line bg-warn-panel',
  danger: 'border-danger-line bg-danger-panel',
  info: 'border-info-line bg-info-panel',
} as const

const NOTE_TITLE = {
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  info: 'text-info',
} as const

/** Aviso con el `>` de cita de Markdown delante del titulo. */
export function Note({
  tone,
  title,
  children,
}: {
  tone: keyof typeof NOTE_TONES
  title?: string
  children?: React.ReactNode
}) {
  return (
    <div className={`rounded-lg border px-3.5 py-3 ${NOTE_TONES[tone]}`}>
      {title && (
        <p className={`text-[12.5px] font-semibold ${NOTE_TITLE[tone]}`}>
          <span className="syntax opacity-70">&gt; </span>
          {title}
        </p>
      )}
      {children && (
        <div
          className={`text-[12.5px] leading-relaxed break-words text-ink-3 ${title ? 'mt-1.5' : ''}`}
        >
          {children}
        </div>
      )}
    </div>
  )
}

/** Titulo con su marca de encabezado Markdown. Nivel 2 o 3 segun el contexto. */
export function Heading({
  level = 3,
  children,
  hint,
}: {
  level?: 2 | 3
  children: React.ReactNode
  hint?: React.ReactNode
}) {
  const size = level === 2 ? 'text-[15px]' : 'text-[12.5px]'
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className={`${size} font-semibold text-ink`}>
        <span className="syntax">{level === 2 ? '## ' : '### '}</span>
        {children}
      </h3>
      {hint && <p className="text-[11.5px] leading-relaxed text-ink-5">{hint}</p>}
    </div>
  )
}

/** Clave entre acentos graves, como un `code` de Markdown. */
export function Key({ children, as = 'span' }: { children: string; as?: 'span' | 'strong' }) {
  const Tag = as
  return (
    <Tag className="font-mono text-[13px] text-ok">
      <span className="opacity-50">`</span>
      {children}
      <span className="opacity-50">`</span>
    </Tag>
  )
}

export function Modal({
  label,
  title,
  subtitle,
  footer,
  onClose,
  maxWidth = 'max-w-[680px]',
  children,
}: {
  label: string
  title: React.ReactNode
  subtitle?: React.ReactNode
  footer?: React.ReactNode
  onClose: () => void
  maxWidth?: string
  children: React.ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center overflow-y-auto px-5 pt-7 pb-14"
      style={{ background: 'var(--overlay)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`h-fit w-full ${maxWidth} rounded-xl border border-line bg-raised shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line-soft px-4.5 py-4">
          <div className="flex min-w-0 flex-col gap-1">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 cursor-pointer rounded-md border border-transparent px-2 py-1 font-mono text-[13px] text-ink-5 hover:bg-control-hover hover:text-ink"
          >
            ✕
          </button>
        </header>

        {subtitle}
        {children}

        {footer && (
          <footer className="flex items-center justify-end gap-2.5 border-t border-line-soft px-4.5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
