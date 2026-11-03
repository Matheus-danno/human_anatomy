import { SYSTEM_IDS, type SystemId } from '../data/systems'

/** O que vai no link compartilhável (fragmento #... da URL). */
export interface ShareableState {
  visible: Record<SystemId, boolean>
  opacity: Record<SystemId, number>
  deepMuscleOpacity: number | null
  peel: number | null
  hiddenStructures: ReadonlySet<string>
  transparentStructures: ReadonlySet<string>
  isolatedIds: ReadonlySet<string> | null
  selectionKey: string | null
  /** posição (x, y, z) e alvo (x, y, z) da câmera */
  camera: readonly number[] | null
}

const ID_LIST = /^[a-z0-9_]+(,[a-z0-9_]+)*$/
const pct = (v: number) => Math.round(v * 100)
const fromPct = (s: string) => Math.min(1, Math.max(0, Number(s) / 100))

// Formato (todos os campos opcionais): s=sistemas visíveis; o=sistema:opacidade% (só os diferentes de 100);
// d=opacidade% dos músculos profundos; p=posição do slider de camadas; h/t/i=estruturas ocultas,
// transparentes e isoladas; sel=seleção; c=câmera (6 números).
export function encodeState(st: ShareableState): string {
  const params = new URLSearchParams()
  params.set('s', SYSTEM_IDS.filter((id) => st.visible[id]).join(','))
  const opacity = SYSTEM_IDS.filter((id) => st.visible[id] && st.opacity[id] < 0.995).map((id) => `${id}:${pct(st.opacity[id])}`)
  if (opacity.length) params.set('o', opacity.join(','))
  if (st.deepMuscleOpacity !== null) params.set('d', String(pct(st.deepMuscleOpacity)))
  if (st.peel !== null) params.set('p', st.peel.toFixed(2))
  if (st.hiddenStructures.size) params.set('h', [...st.hiddenStructures].join(','))
  if (st.transparentStructures.size) params.set('t', [...st.transparentStructures].join(','))
  if (st.isolatedIds) params.set('i', [...st.isolatedIds].join(','))
  if (st.selectionKey) params.set('sel', st.selectionKey)
  if (st.camera) params.set('c', st.camera.map((v) => v.toFixed(3)).join(','))
  return params.toString().replace(/%2C/g, ',').replace(/%3A/g, ':')
}

/** Lê o fragmento da URL; null se não houver estado (ou se for inválido). Campos ruins são ignorados. */
export function decodeState(hash: string): Partial<ShareableState> | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  if (!params.has('s')) return null
  const isSystem = (id: string): id is SystemId => (SYSTEM_IDS as string[]).includes(id)
  const ids = (key: string) => {
    const value = params.get(key)
    return value && ID_LIST.test(value) ? new Set(value.split(',')) : null
  }

  const visibleList = (params.get('s') ?? '').split(',').filter(isSystem)
  const visible = Object.fromEntries(SYSTEM_IDS.map((id) => [id, visibleList.includes(id)])) as Record<SystemId, boolean>
  const opacity = Object.fromEntries(SYSTEM_IDS.map((id) => [id, 1])) as Record<SystemId, number>
  for (const pair of (params.get('o') ?? '').split(',')) {
    const [id, value] = pair.split(':')
    if (isSystem(id) && value && !Number.isNaN(Number(value))) opacity[id] = fromPct(value)
  }
  const d = params.get('d')
  const p = params.get('p')
  const camera = (params.get('c') ?? '').split(',').map(Number)
  const sel = params.get('sel')

  return {
    visible,
    opacity,
    deepMuscleOpacity: d !== null && !Number.isNaN(Number(d)) ? fromPct(d) : null,
    peel: p !== null && !Number.isNaN(Number(p)) ? Number(p) : null,
    hiddenStructures: ids('h') ?? new Set(),
    transparentStructures: ids('t') ?? new Set(),
    isolatedIds: ids('i'),
    selectionKey: sel && /^[a-z0-9_]+$/.test(sel) ? sel : null,
    camera: camera.length === 6 && camera.every(Number.isFinite) ? camera : null,
  }
}

/** Estado lido da URL ao abrir a página (antes de qualquer atualização feita pelo app). */
export const initialUrlState = typeof window !== 'undefined' ? decodeState(window.location.hash) : null
