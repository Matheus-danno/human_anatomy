import type { AnatomyData } from './structures'
import type { SystemId } from './systems'

export interface SearchEntry {
  /** id da estrutura ou do grupo; também é a chave da seleção. */
  key: string
  kind: 'estrutura' | 'grupo'
  nomePt: string
  nomeLatim: string | null
  systems: SystemId[]
  ids: string[]
  /** Campos normalizados (sem acento, minúsculas) usados no ranking. */
  pt: string
  la: string
  all: string
}

/** Minúsculas e sem acentos: "Fêmur" e "femur" se encontram. */
export const normalize = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function buildSearchIndex({ structures, groups }: AnatomyData): SearchEntry[] {
  const entries: SearchEntry[] = groups.map((g) => ({
    key: g.id,
    kind: 'grupo',
    nomePt: g.nomePt,
    nomeLatim: g.nomeLatim,
    systems: g.sistemas,
    ids: g.membros,
    pt: normalize(g.nomePt),
    la: normalize(g.nomeLatim ?? ''),
    all: normalize(`${g.nomePt} ${g.nomeLatim ?? ''}`),
  }))
  for (const s of structures.values()) {
    const pt = normalize(s.nomePt)
    const la = normalize(s.nomeLatim ?? '')
    entries.push({
      key: s.id,
      kind: 'estrutura',
      nomePt: s.nomePt,
      nomeLatim: s.nomeLatim,
      systems: [s.sistema],
      ids: [s.id],
      pt,
      la,
      all: normalize(`${s.nomePt} ${s.nomeLatim ?? ''} ${s.original} ${s.sinonimos?.join(' ') ?? ''}`),
    })
  }
  return entries
}

const wordStarts = (text: string, token: string) => text.startsWith(token) || text.includes(` ${token}`)

/** Menor é melhor; null = não casa. Todos os termos da busca precisam aparecer em algum campo. */
function score(entry: SearchEntry, query: string, tokens: string[]): number | null {
  if (!tokens.every((t) => entry.all.includes(t))) return null
  if (entry.pt.startsWith(query)) return 0
  if (tokens.every((t) => wordStarts(entry.pt, t))) return 1
  if (entry.la.startsWith(query)) return 2
  if (tokens.every((t) => wordStarts(entry.all, t))) return 3
  return 4
}

export function search(index: readonly SearchEntry[], rawQuery: string, limit = 8): SearchEntry[] {
  const query = normalize(rawQuery).trim().replace(/\s+/g, ' ')
  if (query.length < 2) return []
  const tokens = query.split(' ')
  const scored: { entry: SearchEntry; s: number }[] = []
  for (const entry of index) {
    const s = score(entry, query, tokens)
    if (s !== null) scored.push({ entry, s })
  }
  scored.sort(
    (a, b) =>
      a.s - b.s ||
      (a.entry.kind === 'grupo' ? -1 : 0) - (b.entry.kind === 'grupo' ? -1 : 0) ||
      a.entry.nomePt.length - b.entry.nomePt.length ||
      a.entry.nomePt.localeCompare(b.entry.nomePt, 'pt-BR'),
  )
  return scored.slice(0, limit).map((x) => x.entry)
}
