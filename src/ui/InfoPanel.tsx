import { SYSTEM_BY_ID } from '../data/systems'
import { sameSet, useAnatomyStore } from '../store/useAnatomyStore'

const actionClass =
  'flex-1 rounded-md px-2 py-2.5 text-sm lg:py-2 lg:text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sky-400'
const toggleClass = (on: boolean) =>
  `${actionClass} ${on ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-100 hover:bg-slate-700'}`

export function InfoPanel() {
  const selection = useAnatomyStore((s) => s.selection)
  const structure = useAnatomyStore((s) => (s.selection ? s.structures?.get(s.selection.key) : undefined))
  const group = useAnatomyStore((s) => s.groups.find((g) => g.id === s.selection?.key))
  const isolated = useAnatomyStore((s) => s.selection !== null && sameSet(s.isolatedIds, s.selection.ids))
  const transparent = useAnatomyStore(
    (s) => s.selection !== null && [...s.selection.ids].every((id) => s.transparentStructures.has(id)),
  )
  const { clearSelection, setStructuresHidden, isolate, toggleTransparent } = useAnatomyStore.getState()

  if (!selection) return null
  const title = group?.nomePt ?? structure?.nomePt ?? selection.key
  const latin = group?.nomeLatim ?? structure?.nomeLatim
  const systems = group ? group.sistemas : structure ? [structure.sistema] : []

  return (
    <aside
      className="absolute inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 max-h-[45vh] overflow-y-auto rounded-lg bg-slate-900/95 p-4 shadow-lg backdrop-blur lg:inset-x-auto lg:bottom-auto lg:right-4 lg:top-4 lg:max-h-none lg:w-80"
      aria-label="Estrutura selecionada"
    >
      <div className="flex items-start gap-2">
        <h2 className="flex-1 text-base font-semibold leading-snug text-slate-50">{title}</h2>
        <button
          type="button"
          onClick={clearSelection}
          aria-label="Fechar (Esc)"
          title="Fechar (Esc)"
          className="rounded px-2 text-2xl leading-none lg:px-1.5 lg:text-lg text-slate-400 hover:bg-slate-800 hover:text-slate-100"
        >
          ×
        </button>
      </div>
      {latin && <p className="mt-0.5 text-sm italic text-slate-300">{latin}</p>}

      <dl className="mt-3 space-y-1.5 text-sm">
        {systems.map((id) => (
          <div key={id} className="flex items-center gap-2 text-slate-200">
            <dt className="sr-only">Sistema</dt>
            <span className="h-3 w-3 rounded-full ring-1 ring-white/20" style={{ backgroundColor: SYSTEM_BY_ID[id].color }} />
            <dd>{SYSTEM_BY_ID[id].label}</dd>
          </div>
        ))}
        {structure && (
          <div className="flex gap-1 text-slate-400">
            <dt>Região:</dt>
            <dd className="text-slate-200">{structure.regiao}</dd>
          </div>
        )}
        {group && <p className="text-slate-400">Grupo com {group.membros.length} estruturas</p>}
      </dl>

      {structure?.revisar && (
        <p className="mt-3 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-300">Tradução em revisão</p>
      )}
      {structure && <p className="mt-3 text-xs text-slate-500">Z-Anatomy: {structure.original}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setStructuresHidden(selection.ids, true)}
          title="Ocultar (H)"
          className={`${actionClass} bg-slate-800 text-slate-100 hover:bg-slate-700`}
        >
          Ocultar
        </button>
        <button
          type="button"
          onClick={() => isolate(isolated ? null : selection.ids)}
          aria-pressed={isolated}
          title="Isolar (I)"
          className={toggleClass(isolated)}
        >
          {isolated ? 'Sair do isolamento' : 'Isolar'}
        </button>
        <button
          type="button"
          onClick={() => toggleTransparent(selection.ids)}
          aria-pressed={transparent}
          className={toggleClass(transparent)}
        >
          Transparente
        </button>
      </div>
    </aside>
  )
}
