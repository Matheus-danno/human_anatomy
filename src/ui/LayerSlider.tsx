import { PEEL_LAYERS, PEEL_MAX } from '../data/layers'
import { useAnatomyStore } from '../store/useAnatomyStore'

/** Slider vertical que "descasca" o corpo: pele no topo, esqueleto embaixo. */
export function LayerSlider() {
  const peel = useAnatomyStore((s) => s.peel)
  const hasSelection = useAnatomyStore((s) => s.selection !== null)
  const { checkpoint, setPeel } = useAnatomyStore.getState()
  const value = peel ?? 0
  const current = PEEL_LAYERS[Math.min(PEEL_MAX, Math.floor(value))]

  const jumpTo = (index: number) => {
    checkpoint()
    setPeel(index)
  }

  return (
    <section
      aria-labelledby="layers-title"
      className={`${hasSelection ? 'hidden lg:block' : ''} absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-slate-900/85 p-2 shadow-lg backdrop-blur lg:right-4 lg:p-3`}
    >
      <h2 id="layers-title" className="mb-2 hidden text-xs font-medium uppercase tracking-wide text-slate-400 lg:block">
        Camadas
      </h2>
      <p className="mb-2 w-16 text-center text-xs font-medium leading-tight text-sky-300 lg:hidden">
        {peel === null ? 'Camadas' : current.label}
      </p>
      <div className="flex justify-center gap-3">
        <ol className="hidden h-56 flex-col lg:flex justify-between text-right text-xs">
          {PEEL_LAYERS.map((layer, i) => {
            const active = peel !== null && Math.min(PEEL_MAX, Math.floor(value)) === i
            return (
              <li key={layer.id}>
                <button
                  type="button"
                  onClick={() => jumpTo(i)}
                  className={`rounded px-1 py-0.5 hover:bg-slate-800 ${active ? 'font-semibold text-sky-300' : 'text-slate-300'}`}
                >
                  {layer.label}
                </button>
              </li>
            )
          })}
        </ol>
        <input
          type="range"
          min={0}
          max={PEEL_MAX}
          step={0.02}
          value={value}
          onPointerDown={checkpoint}
          onKeyDown={(e) => !e.repeat && checkpoint()}
          onChange={(e) => setPeel(Number(e.target.value))}
          aria-label="Camadas do corpo"
          aria-valuetext={peel === null ? 'Livre' : current.label}
          // Vertical com o mínimo (pele) no topo.
          className="h-44 w-6 cursor-pointer lg:h-56 lg:w-4 accent-sky-400 [writing-mode:vertical-lr]"
        />
      </div>
    </section>
  )
}
