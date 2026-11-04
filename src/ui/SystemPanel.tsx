import { useEffect, useState } from 'react'
import { PRESETS } from '../data/presets'
import { SYSTEM_GROUPS, SYSTEMS, type SystemInfo } from '../data/systems'
import { useAnatomyStore, type Quality } from '../store/useAnatomyStore'
import { StructureTree } from './StructureTree'

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M3 3l18 18" />}
    </svg>
  )
}

function SystemRow({ system }: { system: SystemInfo }) {
  const visible = useAnatomyStore((s) => s.visible[system.id])
  const opacity = useAnatomyStore((s) => s.opacity[system.id])
  const loading = useAnatomyStore((s) => s.requested[system.id] && !s.loaded[system.id])
  const { toggleSystem, setOpacity, checkpoint } = useAnatomyStore.getState()
  const percent = Math.round(opacity * 100)

  return (
    <li className="rounded-md px-2 py-1.5 hover:bg-slate-800/70">
      <button
        type="button"
        onClick={() => toggleSystem(system.id)}
        aria-pressed={visible}
        title={visible ? `Ocultar ${system.label}` : `Mostrar ${system.label}`}
        className="flex w-full items-center gap-2 rounded text-left text-sm focus-visible:outline-2 focus-visible:outline-sky-400"
      >
        <span className={visible ? 'text-sky-300' : 'text-slate-500'}>
          <EyeIcon open={visible} />
        </span>
        <span
          className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/20"
          style={{ backgroundColor: system.color, opacity: visible ? 1 : 0.35 }}
          aria-hidden
        />
        <span className={`flex-1 ${visible ? 'text-slate-100' : 'text-slate-400'}`}>{system.label}</span>
        {loading && <span className="text-xs text-sky-300">carregando…</span>}
      </button>
      <div className="mt-1 flex items-center gap-2 pl-6">
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={percent}
          disabled={!visible}
          onPointerDown={checkpoint}
          onKeyDown={(e) => !e.repeat && checkpoint()}
          onChange={(e) => setOpacity(system.id, Number(e.target.value) / 100)}
          aria-label={`Opacidade: ${system.label}`}
          className="h-1 flex-1 cursor-pointer accent-sky-400 disabled:cursor-default disabled:opacity-30"
        />
        <span className={`w-9 text-right text-xs tabular-nums ${visible ? 'text-slate-400' : 'text-slate-600'}`}>
          {percent}%
        </span>
      </div>
    </li>
  )
}

function SystemsTab() {
  const activePreset = useAnatomyStore((s) => s.activePreset)
  const applyPreset = useAnatomyStore((s) => s.applyPreset)

  return (
    <>
      <section className="px-4 pb-3 pt-1" aria-labelledby="presets-title">
        <h2 id="presets-title" className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Vistas rápidas
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset.id)}
              aria-pressed={activePreset === preset.id}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 ${
                activePreset === preset.id ? 'bg-sky-500 text-slate-950' : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </section>
      <nav className="flex-1 overflow-y-auto border-t border-slate-800 px-2 py-2" aria-label="Sistemas">
        {SYSTEM_GROUPS.map((group) => (
          <section key={group.id} className="mb-2">
            <h2 className="px-2 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-slate-400">{group.label}</h2>
            <ul>
              {SYSTEMS.filter((s) => s.group === group.id).map((system) => (
                <SystemRow key={system.id} system={system} />
              ))}
            </ul>
          </section>
        ))}
      </nav>
    </>
  )
}

function QualityToggle() {
  const quality = useAnatomyStore((s) => s.quality)
  const chooseQuality = useAnatomyStore((s) => s.chooseQuality)
  const option = (q: Quality, label: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={quality === q}
      onClick={() => chooseQuality(q)}
      className={`rounded px-2 py-0.5 ${quality === q ? 'bg-slate-600 text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}
    >
      {label}
    </button>
  )
  return (
    <div
      role="radiogroup"
      aria-label="Qualidade gráfica"
      title="Alta: materiais realistas, oclusão ambiente e sombras. Baixa: para máquinas mais fracas."
      className="flex rounded-md bg-slate-800/70 p-0.5 text-[11px] font-medium"
    >
      {option('alta', 'Alta')}
      {option('baixa', 'Baixa')}
    </div>
  )
}

type Tab = 'sistemas' | 'estruturas'

export function SystemPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('sistemas')
  const selectionKey = useAnatomyStore((s) => s.selection?.key)
  // Na gaveta (celular), escolher uma estrutura na árvore fecha o painel para mostrar o modelo.
  useEffect(() => {
    if (selectionKey) onClose()
  }, [selectionKey, onClose])
  const tabClass = (t: Tab) =>
    `flex-1 rounded-md px-3 py-1.5 text-xs font-medium ${tab === t ? 'bg-slate-700 text-slate-50' : 'text-slate-400 hover:text-slate-200'}`

  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={`${open ? 'flex' : 'hidden'} fixed inset-y-0 left-0 z-40 w-[min(20rem,85vw)] flex-col rounded-r-lg bg-slate-900/95 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-lg backdrop-blur lg:absolute lg:bottom-4 lg:left-4 lg:top-4 lg:z-auto lg:flex lg:w-80 lg:rounded-lg lg:bg-slate-900/85 lg:p-0`}
      >
      <header className="flex items-center gap-2 px-4 pb-2 pt-4">
        <h1 className="flex-1 text-lg font-semibold">Atlas de Anatomia 3D</h1>
        <QualityToggle />
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar painel"
          className="-mr-2 rounded px-2 text-2xl leading-none text-slate-400 hover:bg-slate-800 hover:text-slate-100 lg:hidden"
        >
          ×
        </button>
      </header>
      <div role="tablist" aria-label="Painel" className="mx-4 mb-2 flex gap-1 rounded-lg bg-slate-800/70 p-1">
        <button type="button" role="tab" aria-selected={tab === 'sistemas'} onClick={() => setTab('sistemas')} className={tabClass('sistemas')}>
          Sistemas
        </button>
        <button type="button" role="tab" aria-selected={tab === 'estruturas'} onClick={() => setTab('estruturas')} className={tabClass('estruturas')}>
          Estruturas
        </button>
      </div>

      {tab === 'sistemas' ? (
        <SystemsTab />
      ) : (
        <div role="tabpanel" className="flex-1 overflow-y-auto border-t border-slate-800 px-2 py-2">
          <StructureTree />
        </div>
      )}

      <footer className="border-t border-slate-800 px-4 py-3 text-xs text-slate-500">
        Modelos: Z-Anatomy (CC BY-SA 4.0), derivados de BodyParts3D © The Database Center for Life Science
        (CC BY-SA 2.1 JP)
      </footer>
      </aside>
    </>
  )
}
