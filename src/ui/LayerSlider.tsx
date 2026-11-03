import { PEEL_LAYERS, PEEL_MAX } from '../data/layers'
import { useAnatomyStore } from '../store/useAnatomyStore'

/** Slider vertical que "descasca" o corpo: pele no topo, esqueleto embaixo. */
export function LayerSlider() {
  const peel = useAnatomyStore((s) => s.peel)
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
      className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg bg-slate-900/85 p-3 shadow-lg backdrop-blur"
    >
      <h2 id="layers-title" className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        Camadas
      </h2>
      <div className="flex gap-3">
        <ol className="flex h-56 flex-col justify-between text-right text-xs">
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
          className="h-56 w-4 cursor-pointer accent-sky-400 [writing-mode:vertical-lr]"
        />
      </div>
    </section>
  )
}
