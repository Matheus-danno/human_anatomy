import { useId, useMemo, useState } from 'react'
import { buildSearchIndex, search, type SearchEntry } from '../data/search'
import { SYSTEM_BY_ID } from '../data/systems'
import { useAnatomyStore } from '../store/useAnatomyStore'

export function SearchBar() {
  const structures = useAnatomyStore((s) => s.structures)
  const groups = useAnatomyStore((s) => s.groups)
  const reveal = useAnatomyStore((s) => s.reveal)
  const index = useMemo(() => (structures ? buildSearchIndex({ structures, groups }) : []), [structures, groups])
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const results = useMemo(() => search(index, query), [index, query])
  const listId = useId()

  const choose = (entry: SearchEntry) => {
    reveal({ key: entry.key, ids: entry.ids, systems: entry.systems })
    setQuery('')
    setOpen(false)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      if (results.length) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length)
    } else if (e.key === 'Enter' && results[active]) {
      e.preventDefault()
      choose(results[active])
    } else if (e.key === 'Escape') {
      // Fecha só a lista; não deixa o Esc chegar ao atalho global que limpa a seleção.
      e.stopPropagation()
      setOpen(false)
      e.currentTarget.blur()
    }
  }

  const showList = open && results.length > 0

  return (
    <div className="absolute left-16 right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 lg:left-1/2 lg:right-auto lg:top-4 lg:w-[min(28rem,calc(100vw-48rem))] lg:min-w-72 lg:-translate-x-1/2">
      <input
        type="search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
        aria-label="Buscar estrutura"
        placeholder={structures ? 'Buscar estrutura (português ou latim)…' : 'Carregando nomes…'}
        disabled={!structures}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        className="h-11 w-full rounded-lg bg-slate-900/90 px-4 text-base lg:h-auto lg:py-2.5 lg:text-sm text-slate-100 shadow-lg ring-1 ring-white/10 backdrop-blur placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-60"
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Resultados da busca"
          className="mt-1 max-h-[60vh] overflow-y-auto lg:max-h-96 rounded-lg bg-slate-900/95 py-1 shadow-xl ring-1 ring-white/10 backdrop-blur"
        >
          {results.map((entry, i) => (
            <li
              key={entry.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown (antes do blur do input) para o clique não se perder.
              onMouseDown={(e) => {
                e.preventDefault()
                choose(entry)
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${i === active ? 'bg-slate-800' : ''}`}
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: SYSTEM_BY_ID[entry.systems[0]].color }}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-slate-100">{entry.nomePt}</span>
                {entry.nomeLatim && <span className="block truncate text-xs italic text-slate-400">{entry.nomeLatim}</span>}
              </span>
              {entry.kind === 'grupo' && (
                <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-300">
                  {entry.ids.length} partes
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
