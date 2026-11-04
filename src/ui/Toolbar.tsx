import { useState } from 'react'
import { useAnatomyStore, type Tool, type ViewName } from '../store/useAnatomyStore'
import { flushUrl } from '../store/urlSync'

const TOOLS: { id: Tool; label: string; title: string }[] = [
  { id: 'selecionar', label: 'Selecionar', title: 'Clique seleciona a estrutura' },
  { id: 'ocultar', label: 'Ocultar', title: 'Clique oculta a estrutura' },
  { id: 'transparente', label: 'Transparente', title: 'Clique deixa a estrutura transparente' },
]

const VIEWS: { id: ViewName; label: string }[] = [
  { id: 'frente', label: 'Frente' },
  { id: 'costas', label: 'Costas' },
  { id: 'esquerda', label: 'Esquerda' },
  { id: 'direita', label: 'Direita' },
  { id: 'cima', label: 'Cima' },
]

const button =
  'shrink-0 whitespace-nowrap rounded-md px-3 py-2.5 text-sm lg:px-2.5 lg:py-1.5 lg:text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 disabled:cursor-default disabled:opacity-40'
const idle = `${button} text-slate-200 hover:bg-slate-700 disabled:hover:bg-transparent`
const pressed = `${button} bg-sky-500 text-slate-950`

function Divider() {
  return <span className="mx-1 h-5 w-px shrink-0 bg-slate-700" aria-hidden />
}

export function Toolbar() {
  const tool = useAnatomyStore((s) => s.tool)
  const canUndo = useAnatomyStore((s) => s.history.length > 0)
  const hasChanges = useAnatomyStore(
    (s) => s.isolatedIds !== null || s.hiddenStructures.size > 0 || s.transparentStructures.size > 0,
  )
  const { setTool, undo, showAllStructures, requestView } = useAnatomyStore.getState()
  const [copied, setCopied] = useState(false)

  const share = async () => {
    flushUrl()
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copie o link desta vista:', window.location.href)
    }
  }

  return (
    // Celular: rodapé de largura total com rolagem horizontal. Desktop: centralizada à direita do painel lateral.
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:bottom-4 lg:left-[22rem] lg:right-32 lg:p-0">
      <div
        role="toolbar"
        aria-label="Ferramentas"
        className="pointer-events-auto flex max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto rounded-lg [scrollbar-width:none] lg:flex-wrap lg:overflow-visible bg-slate-900/90 p-1 shadow-lg ring-1 ring-white/10 backdrop-blur"
      >
        <div role="radiogroup" aria-label="Ação do clique" className="flex gap-0.5">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={tool === t.id}
              title={t.title}
              onClick={() => setTool(t.id)}
              className={tool === t.id ? pressed : idle}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Divider />
        <button type="button" onClick={undo} disabled={!canUndo} title="Desfazer (Ctrl+Z)" className={idle}>
          Desfazer
        </button>
        <button type="button" onClick={showAllStructures} disabled={!hasChanges} title="Mostrar estruturas ocultas, transparentes e isoladas" className={idle}>
          Mostrar tudo
        </button>
        <Divider />
        <div role="group" aria-label="Vistas" className="flex gap-0.5">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" onClick={() => requestView(v.id)} title={`Vista: ${v.label.toLowerCase()}`} className={idle}>
              {v.label}
            </button>
          ))}
        </div>
        <Divider />
        <button type="button" onClick={share} title="Copiar link desta vista" className={copied ? pressed : idle} aria-live="polite">
          {copied ? 'Link copiado!' : 'Compartilhar'}
        </button>
      </div>
    </div>
  )
}
