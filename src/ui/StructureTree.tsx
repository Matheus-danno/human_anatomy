import { useEffect, useMemo, useRef, useState } from 'react'
import type { Region, StructureInfo } from '../data/structures'
import { SYSTEMS, type SystemId } from '../data/systems'
import { useAnatomyStore } from '../store/useAnatomyStore'

const REGIONS: Region[] = ['cabeça', 'pescoço', 'tórax', 'abdômen', 'pelve', 'membro superior', 'membro inferior']
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: () => void
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={onChange}
      aria-label={label}
      className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-sky-400"
    />
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} fill="currentColor" aria-hidden>
      <path d="M6 3l5 5-5 5z" />
    </svg>
  )
}

function RegionNode({ system, region, items }: { system: SystemId; region: Region; items: StructureInfo[] }) {
  const [open, setOpen] = useState(false)
  const hidden = useAnatomyStore((s) => s.hiddenStructures)
  const { setStructuresHidden, reveal } = useAnatomyStore.getState()
  const hiddenCount = items.filter((i) => hidden.has(i.id)).length
  const ids = items.map((i) => i.id)

  return (
    <li>
      <div className="flex items-center gap-1.5 rounded py-0.5 pl-5 pr-1 hover:bg-slate-800/70">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex flex-1 items-center gap-1.5 text-left text-slate-300">
          <Chevron open={open} />
          <span className="flex-1">{capitalize(region)}</span>
          <span className="text-slate-500 tabular-nums">{items.length}</span>
        </button>
        <Checkbox
          checked={hiddenCount < items.length}
          indeterminate={hiddenCount > 0 && hiddenCount < items.length}
          onChange={() => setStructuresHidden(ids, hiddenCount === 0)}
          label={`Mostrar ${region}`}
        />
      </div>
      {open && (
        <ul>
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-1.5 rounded py-0.5 pl-10 pr-1 hover:bg-slate-800/70">
              <button
                type="button"
                title="Selecionar e enquadrar"
                onClick={() => reveal({ key: item.id, ids: [item.id], systems: [system] }, { dimOthers: false })}
                className={`flex-1 truncate text-left ${hidden.has(item.id) ? 'text-slate-500' : 'text-slate-200'}`}
              >
                {item.nomePt}
              </button>
              <Checkbox
                checked={!hidden.has(item.id)}
                onChange={() => setStructuresHidden([item.id], !hidden.has(item.id))}
                label={`Mostrar ${item.nomePt}`}
              />
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function SystemNode({ system, label, regions }: { system: SystemId; label: string; regions: Map<Region, StructureInfo[]> }) {
  const [open, setOpen] = useState(false)
  const visible = useAnatomyStore((s) => s.visible[system])
  const toggleSystem = useAnatomyStore((s) => s.toggleSystem)
  const total = [...regions.values()].reduce((n, items) => n + items.length, 0)

  return (
    <li>
      <div className="flex items-center gap-1.5 rounded px-1 py-1 hover:bg-slate-800/70">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex flex-1 items-center gap-1.5 text-left font-medium text-slate-100">
          <Chevron open={open} />
          <span className="flex-1">{label}</span>
          <span className="text-xs font-normal text-slate-500 tabular-nums">{total}</span>
        </button>
        <Checkbox checked={visible} onChange={() => toggleSystem(system)} label={`Mostrar ${label}`} />
      </div>
      {open && (
        <ul className="text-xs">
          {REGIONS.filter((r) => regions.has(r)).map((region) => (
            <RegionNode key={region} system={system} region={region} items={regions.get(region)!} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** Árvore sistema → região → estrutura, com caixas para mostrar/ocultar em cada nível. */
export function StructureTree() {
  const structures = useAnatomyStore((s) => s.structures)
  const tree = useMemo(() => {
    const bySystem = new Map<SystemId, Map<Region, StructureInfo[]>>()
    if (!structures) return bySystem
    const sorted = [...structures.values()].sort((a, b) => a.nomePt.localeCompare(b.nomePt, 'pt-BR'))
    for (const s of sorted) {
      let regions = bySystem.get(s.sistema)
      if (!regions) bySystem.set(s.sistema, (regions = new Map()))
      const list = regions.get(s.regiao)
      if (list) list.push(s)
      else regions.set(s.regiao, [s])
    }
    return bySystem
  }, [structures])

  if (!structures) return <p className="px-3 py-2 text-sm text-slate-400">Carregando nomes…</p>

  return (
    <ul className="text-sm" aria-label="Estruturas por sistema e região">
      {SYSTEMS.filter((s) => tree.has(s.id)).map((s) => (
        <SystemNode key={s.id} system={s.id} label={s.label} regions={tree.get(s.id)!} />
      ))}
    </ul>
  )
}
