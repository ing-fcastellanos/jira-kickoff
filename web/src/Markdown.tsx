import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Render del Markdown que sale de las descripciones y comentarios de Jira.
 *
 * Sin `rehype-raw` a proposito: el HTML crudo que pudiera venir del ticket no se
 * ejecuta, solo se muestra como texto. Es contenido de terceros y no tiene por
 * que poder inyectar nada en la pagina.
 */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (p) => <h3 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100" {...p} />,
          h2: (p) => <h3 className="mt-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100" {...p} />,
          h3: (p) => <h4 className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100" {...p} />,
          h4: (p) => <h5 className="mt-3 text-sm font-medium text-zinc-900 dark:text-zinc-100" {...p} />,
          p: (p) => <p className="my-2" {...p} />,
          ul: (p) => <ul className="my-2 list-disc space-y-1 pl-5" {...p} />,
          ol: (p) => <ol className="my-2 list-decimal space-y-1 pl-5" {...p} />,
          a: (p) => (
            <a
              className="text-sky-700 underline hover:no-underline dark:text-sky-400"
              target="_blank"
              rel="noreferrer"
              {...p}
            />
          ),
          blockquote: (p) => (
            <blockquote
              className="my-2 border-l-2 border-zinc-300 pl-3 text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
              {...p}
            />
          ),
          hr: () => <hr className="my-4 border-zinc-200 dark:border-zinc-800" />,
          code: ({ children, className }) => {
            // Sin lenguaje es codigo en linea; con el, un bloque dentro de <pre>.
            const isBlock = Boolean(className)
            return isBlock ? (
              <code className="font-mono text-xs">{children}</code>
            ) : (
              <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                {children}
              </code>
            )
          },
          pre: (p) => (
            <pre
              className="my-2 overflow-x-auto rounded-md bg-zinc-100 p-3 dark:bg-zinc-900"
              {...p}
            />
          ),
          // Las tablas de Jira pueden ser anchas: se desplazan dentro de su caja
          // en vez de forzar scroll horizontal a todo el modal.
          table: (p) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs" {...p} />
            </div>
          ),
          th: (p) => (
            <th
              className="border border-zinc-200 bg-zinc-50 px-2 py-1 text-left font-semibold dark:border-zinc-800 dark:bg-zinc-900"
              {...p}
            />
          ),
          td: (p) => (
            <td className="border border-zinc-200 px-2 py-1 align-top dark:border-zinc-800" {...p} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
