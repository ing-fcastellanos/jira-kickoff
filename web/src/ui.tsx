import { useEffect } from 'react'
import { useT } from './LocaleProvider'

/**
 * Shared interface primitives.
 *
 * The four modals repeated overlay, close on Escape, header and buttons. Having
 * it in one place is not just less code: it is what guarantees the five surfaces
 * keep speaking the same language when one of them changes.
 */

const VARIANTS = {
  /* Primary action: solid lavender, the only piece that fills with colour. */
  primary: 'border-accent bg-accent text-accent-ink hover:bg-accent-hover hover:border-accent-hover',
  /* Secondary action for headers and forms. */
  default: 'border-line bg-panel text-ink-3 hover:bg-control-hover hover:border-line-strong',
  /* Action inside a card or row, on an already elevated background. */
  quiet: 'border-line-strong bg-control text-ink-3 hover:bg-control-hover',
  /* Alternative to primary when the action is not the expected one. */
  outline: 'border-line-strong bg-transparent text-ink hover:bg-control',
  ghost: 'border-transparent bg-transparent text-ink-5 hover:bg-control-hover hover:text-ink',
  danger: 'border-danger bg-danger text-danger-ink hover:opacity-90',
  /*
   * States that in Tailwind cannot be achieved by overriding the base variant
   * through className: when two utilities of the same group compete, the winner
   * is the one that comes later in the generated CSS, not the one written later
   * in the attribute.
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

/**
 * Quick-pick buttons for a Claude model, plus a mono input for any other
 * alias or full model id. The input is not a separate "custom" mode: clicking
 * a preset just writes its value into it, so it is always the live source of
 * truth and needs no state of its own to track whether a custom value is set.
 */
export function ModelPicker({
  value,
  onChange,
  presets,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  presets: { value: string; label: string }[]
  placeholder: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Button
            key={p.value}
            variant={value === p.value ? 'selected' : 'default'}
            onClick={() => onChange(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className={monoInputClass}
      />
    </div>
  )
}

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

/** Notice with Markdown's quote `>` in front of the title. */
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

/** Title with its Markdown heading mark. Level 2 or 3 depending on the context. */
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

/** Key between backticks, like a Markdown `code`. */
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
  const { t } = useT()

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
            aria-label={t('common.close')}
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
