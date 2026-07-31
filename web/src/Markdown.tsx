import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Render del Markdown que sale de las descripciones y comentarios de Jira.
 *
 * Sin `rehype-raw` a proposito: el HTML crudo que pudiera venir del ticket no se
 * ejecuta, solo se muestra como texto. Es contenido de terceros y no tiene por
 * que poder inyectar nada en la pagina.
 *
 * Los encabezados conservan su marca (`####`) y las listas su guion, en el mismo
 * lavanda que el resto de la interfaz: el contenido de Jira ya viene en Markdown
 * y la direccion visual consiste justamente en no esconderlo.
 */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-[11px] text-[13.5px] leading-[1.65] text-ink-3">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h4 className="mt-1 text-[13.5px] font-semibold text-ink">
              <span className="syntax">## </span>
              {children}
            </h4>
          ),
          h2: ({ children }) => (
            <h4 className="mt-1 text-[13.5px] font-semibold text-ink">
              <span className="syntax">### </span>
              {children}
            </h4>
          ),
          h3: ({ children }) => (
            <h5 className="mt-1 text-[13.5px] font-semibold text-ink">
              <span className="syntax">#### </span>
              {children}
            </h5>
          ),
          h4: ({ children }) => (
            <h6 className="mt-1 text-[13px] font-semibold text-ink-2">
              <span className="syntax">##### </span>
              {children}
            </h6>
          ),
          p: (p) => <p className="text-pretty" {...p} />,
          strong: (p) => <strong className="font-semibold text-ink" {...p} />,
          em: (p) => <em className="text-ink-2" {...p} />,
          ul: (p) => <ul className="flex list-none flex-col gap-1.5 pl-1" {...p} />,
          ol: (p) => <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:text-ink-6" {...p} />,
          li: ({ children, ...rest }) => {
            // El guion se dibuja aparte para poder teñirlo sin tocar el texto.
            const ordered = 'data-ordered' in rest
            return ordered ? (
              <li {...rest}>{children}</li>
            ) : (
              <li className="flex gap-2.5" {...rest}>
                <span className="syntax shrink-0">-</span>
                <span className="min-w-0">{children}</span>
              </li>
            )
          },
          a: (p) => (
            <a
              className="text-accent hover:underline hover:underline-offset-2"
              target="_blank"
              rel="noreferrer"
              {...p}
            />
          ),
          blockquote: (p) => (
            <blockquote
              className="border-l-2 border-line-strong pl-3 text-[12.5px] italic text-ink-4"
              {...p}
            />
          ),
          hr: () => <hr className="border-line-soft" />,
          code: ({ children, className }) => {
            // Sin lenguaje es codigo en linea; con el, un bloque dentro de <pre>.
            const isBlock = Boolean(className)
            return isBlock ? (
              <code className="font-mono text-[11.5px] leading-[1.6] text-ok">{children}</code>
            ) : (
              <code className="font-mono text-[12.5px] text-ok">{children}</code>
            )
          },
          pre: (p) => (
            <pre
              className="overflow-x-auto rounded-md border border-line-soft bg-input px-3 py-2.5"
              {...p}
            />
          ),
          // Las tablas de Jira pueden ser anchas: se desplazan dentro de su caja
          // en vez de forzar scroll horizontal a todo el modal.
          table: (p) => (
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-[12px]" {...p} />
            </div>
          ),
          th: (p) => (
            <th
              className="border-b border-line bg-panel px-2.5 py-2 text-left text-[11.5px] font-semibold text-ink-4"
              {...p}
            />
          ),
          td: (p) => <td className="border-b border-line-soft px-2.5 py-2 align-top" {...p} />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
