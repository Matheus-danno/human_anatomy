import { create } from 'zustand'
import { layerOpacity, ORGAN_SYSTEMS } from '../data/layers'
import { INITIAL_PRESET, PRESET_BY_ID, type PresetId } from '../data/presets'
import type { AnatomyData, GroupInfo, StructureInfo } from '../data/structures'
import { SYSTEM_IDS, type SystemId } from '../data/systems'
import { initialUrlState } from './urlState'

type PerSystem<T> = Record<SystemId, T>

function perSystem<T>(value: T): PerSystem<T> {
  return Object.fromEntries(SYSTEM_IDS.map((id) => [id, value])) as PerSystem<T>
}

function withItems(set: ReadonlySet<string>, items: Iterable<string>, present: boolean): ReadonlySet<string> {
  const next = new Set(set)
  for (const item of items) {
    if (present) next.add(item)
    else next.delete(item)
  }
  return next
}

export const sameSet = (a: ReadonlySet<string> | null, b: ReadonlySet<string>) =>
  a !== null && a.size === b.size && [...b].every((id) => a.has(id))

/** Opacidade aplicada aos demais sistemas ao revelar uma estrutura pela busca (abaixo do limite de hover). */
const BACKGROUND_OPACITY = 0.15
const MAX_HISTORY = 50

/** Uma estrutura ou um grupo (ex.: o coração, com suas 17 partes). */
export interface Selection {
  key: string
  ids: ReadonlySet<string>
}

/** O que a busca e a árvore precisam para revelar, selecionar e enquadrar estruturas. */
export interface RevealTarget {
  key: string
  ids: readonly string[]
  systems: readonly SystemId[]
}

export type Quality = 'alta' | 'baixa'
const QUALITY_KEY = 'anatomia.qualidade'

/** Escolha salva pelo usuário; sem ela, "baixa" em aparelhos modestos e "alta" no resto. */
function initialQuality(): { quality: Quality; qualityChosen: boolean } {
  try {
    const saved = localStorage.getItem(QUALITY_KEY)
    if (saved === 'alta' || saved === 'baixa') return { quality: saved, qualityChosen: true }
  } catch {
    // armazenamento bloqueado (aba anônima, política do navegador): segue a detecção
  }
  const nav = navigator as Navigator & { deviceMemory?: number }
  const modest =
    (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 || /Mobi|Android/i.test(nav.userAgent)
  return { quality: modest ? 'baixa' : 'alta', qualityChosen: false }
}

/** Modo do clique na cena (barra de ferramentas). */
export type Tool = 'selecionar' | 'ocultar' | 'transparente'
export type ViewName = 'frente' | 'costas' | 'esquerda' | 'direita' | 'cima'

/** Parte do estado que "Desfazer" restaura e que vai no link compartilhável. */
interface SceneState {
  visible: PerSystem<boolean>
  opacity: PerSystem<number>
  /** Opacidade da camada muscular profunda; null = acompanha a do sistema muscular. */
  deepMuscleOpacity: number | null
  /** Posição do slider de camadas (0–4); null quando o estado veio de outro controle. */
  peel: number | null
  hiddenStructures: ReadonlySet<string>
  transparentStructures: ReadonlySet<string>
  /** Quando definido, só essas estruturas ficam visíveis. */
  isolatedIds: ReadonlySet<string> | null
  activePreset: PresetId | null
}

interface AnatomyState extends SceneState {
  /** GLB já pedido: o sistema fica montado (só oculto) depois de desligado, para não baixar de novo. */
  requested: PerSystem<boolean>
  loaded: PerSystem<boolean>
  /** Nomes e grupos; null até o JSON carregar. */
  structures: ReadonlyMap<string, StructureInfo> | null
  groups: readonly GroupInfo[]
  hoveredId: string | null
  selection: Selection | null
  /** Seleção vinda do link que depende dos nomes carregarem (grupos). */
  pendingSelectionKey: string | null
  tool: Tool
  /** Qualidade gráfica (por usuário, não vai no link). */
  quality: Quality
  /** true quando o usuário escolheu a qualidade; aí o monitor de desempenho não muda sozinho. */
  qualityChosen: boolean
  history: SceneState[]
  /** Pedido para a câmera enquadrar estruturas; o nonce distingue pedidos repetidos. */
  focusRequest: { ids: readonly string[]; nonce: number } | null
  /** Pedido de vista padrão (frente, costas...). */
  viewRequest: { view: ViewName; nonce: number } | null

  setVisible: (id: SystemId, visible: boolean) => void
  toggleSystem: (id: SystemId) => void
  /** Para sliders: guarda o estado no histórico uma vez, no início do arraste. */
  checkpoint: () => void
  setOpacity: (id: SystemId, opacity: number) => void
  setPeel: (peel: number) => void
  markLoaded: (id: SystemId) => void
  setAnatomy: (data: AnatomyData) => void
  setStructuresHidden: (ids: Iterable<string>, hidden: boolean) => void
  showAllStructures: () => void
  /** Liga/desliga "Transparente" no conjunto todo (se todas já estão transparentes, volta ao normal). */
  toggleTransparent: (ids: ReadonlySet<string>) => void
  isolate: (ids: ReadonlySet<string> | null) => void
  setHovered: (anatomyId: string | null) => void
  selectStructure: (anatomyId: string | null) => void
  clearSelection: () => void
  /** Liga o sistema, desfaz ocultações, seleciona e enquadra. Com `dimOthers`, deixa os demais translúcidos. */
  reveal: (target: RevealTarget, options?: { dimOthers?: boolean }) => void
  applyPreset: (id: PresetId) => void
  setTool: (tool: Tool) => void
  /** Escolha do usuário (salva no navegador). */
  chooseQuality: (quality: Quality) => void
  /** Queda de desempenho detectada: baixa a qualidade, a menos que o usuário tenha escolhido. */
  degradeQuality: () => void
  undo: () => void
  requestView: (view: ViewName) => void
}

const snapshot = (s: SceneState): SceneState => ({
  visible: s.visible,
  opacity: s.opacity,
  deepMuscleOpacity: s.deepMuscleOpacity,
  peel: s.peel,
  hiddenStructures: s.hiddenStructures,
  transparentStructures: s.transparentStructures,
  isolatedIds: s.isolatedIds,
  activePreset: s.activePreset,
})
const pushHistory = (s: AnatomyState) => ({ history: [...s.history.slice(-(MAX_HISTORY - 1)), snapshot(s)] })

const requestVisible = (requested: PerSystem<boolean>, visible: PerSystem<boolean>) => {
  const next = { ...requested }
  for (const sys of SYSTEM_IDS) if (visible[sys]) next[sys] = true
  return next
}

function presetState(id: PresetId) {
  const visible = perSystem(false)
  const opacity = perSystem(1)
  for (const layer of PRESET_BY_ID[id].layers) {
    visible[layer.system] = true
    opacity[layer.system] = layer.opacity ?? 1
  }
  return { visible, opacity, deepMuscleOpacity: null, peel: null, activePreset: id }
}

/** Camadas: pele (0), músculos superficiais (1), profundos (2), órgãos (3), esqueleto (4, sempre visível). */
function peelState(peel: number, s: SceneState) {
  const visible = { ...s.visible }
  const opacity = { ...s.opacity }
  const show = (sys: SystemId, value: number) => {
    opacity[sys] = value
    visible[sys] = value > 0
  }
  show('skin', layerOpacity(peel, 0))
  const superficial = layerOpacity(peel, 1)
  const deep = layerOpacity(peel, 2)
  opacity.muscular = superficial
  visible.muscular = superficial > 0 || deep > 0
  for (const sys of ORGAN_SYSTEMS) show(sys, layerOpacity(peel, 3))
  show('skeletal', 1)
  return { visible, opacity, deepMuscleOpacity: deep, peel, activePreset: null }
}

function initialScene(): SceneState {
  const base: SceneState = {
    ...presetState(INITIAL_PRESET),
    hiddenStructures: new Set(),
    transparentStructures: new Set(),
    isolatedIds: null,
  }
  if (!initialUrlState) return base
  const { selectionKey: _selectionKey, camera: _camera, ...scene } = initialUrlState
  return { ...base, ...scene, activePreset: null }
}

const scene = initialScene()
const urlSelection = initialUrlState?.selectionKey ?? null

export const useAnatomyStore = create<AnatomyState>((set) => ({
  ...scene,
  requested: requestVisible(perSystem(false), scene.visible),
  loaded: perSystem(false),
  structures: null,
  groups: [],
  hoveredId: null,
  // Estruturas do link são selecionadas já; grupos esperam os nomes carregarem (setAnatomy).
  selection: urlSelection && !urlSelection.startsWith('grupo_') ? { key: urlSelection, ids: new Set([urlSelection]) } : null,
  pendingSelectionKey: urlSelection?.startsWith('grupo_') ? urlSelection : null,
  tool: 'selecionar',
  ...initialQuality(),
  history: [],
  focusRequest: null,
  viewRequest: null,

  setVisible: (id, visible) =>
    set((s) => ({
      ...pushHistory(s),
      visible: { ...s.visible, [id]: visible },
      requested: visible ? { ...s.requested, [id]: true } : s.requested,
      activePreset: null,
      peel: null,
    })),
  toggleSystem: (id) =>
    set((s) => ({
      ...pushHistory(s),
      visible: { ...s.visible, [id]: !s.visible[id] },
      requested: { ...s.requested, [id]: true },
      activePreset: null,
      peel: null,
    })),
  checkpoint: () => set(pushHistory),
  setOpacity: (id, opacity) =>
    set((s) => ({
      opacity: { ...s.opacity, [id]: opacity },
      deepMuscleOpacity: id === 'muscular' ? null : s.deepMuscleOpacity,
      activePreset: null,
      peel: null,
    })),
  setPeel: (peel) =>
    set((s) => {
      const next = peelState(peel, s)
      return { ...next, requested: requestVisible(s.requested, next.visible) }
    }),
  markLoaded: (id) => set((s) => (s.loaded[id] ? s : { loaded: { ...s.loaded, [id]: true } })),
  setAnatomy: ({ structures, groups }) =>
    set((s) => {
      const group = groups.find((g) => g.id === s.pendingSelectionKey)
      const selectionValid = !s.selection || structures.has(s.selection.key)
      return {
        structures,
        groups,
        pendingSelectionKey: null,
        selection: group ? { key: group.id, ids: new Set(group.membros) } : selectionValid ? s.selection : null,
      }
    }),
  setStructuresHidden: (ids, hidden) =>
    set((s) => {
      const hiddenStructures = withItems(s.hiddenStructures, ids, hidden)
      const touched = (sel: ReadonlySet<string> | null | undefined) => sel && [...sel].some((id) => hiddenStructures.has(id))
      return {
        ...pushHistory(s),
        hiddenStructures,
        selection: touched(s.selection?.ids) ? null : s.selection,
        hoveredId: s.hoveredId && hiddenStructures.has(s.hoveredId) ? null : s.hoveredId,
        isolatedIds: touched(s.isolatedIds) ? null : s.isolatedIds,
      }
    }),
  showAllStructures: () =>
    set((s) => ({ ...pushHistory(s), hiddenStructures: new Set(), transparentStructures: new Set(), isolatedIds: null })),
  toggleTransparent: (ids) =>
    set((s) => {
      const allTransparent = [...ids].every((id) => s.transparentStructures.has(id))
      return { ...pushHistory(s), transparentStructures: withItems(s.transparentStructures, ids, !allTransparent) }
    }),
  isolate: (ids) => set((s) => ({ ...pushHistory(s), isolatedIds: ids })),
  setHovered: (anatomyId) => set((s) => (s.hoveredId === anatomyId ? s : { hoveredId: anatomyId })),
  selectStructure: (anatomyId) =>
    set({ selection: anatomyId ? { key: anatomyId, ids: new Set([anatomyId]) } : null }),
  clearSelection: () => set({ selection: null }),
  reveal: ({ key, ids, systems }, { dimOthers = true } = {}) =>
    set((s) => {
      const visible = { ...s.visible }
      const opacity = { ...s.opacity }
      let deepMuscleOpacity = s.deepMuscleOpacity
      for (const sys of SYSTEM_IDS) {
        if (systems.includes(sys)) {
          visible[sys] = true
          opacity[sys] = Math.max(opacity[sys], 0.6)
          if (sys === 'muscular') deepMuscleOpacity = null
        } else if (dimOthers && visible[sys]) {
          opacity[sys] = Math.min(opacity[sys], BACKGROUND_OPACITY)
          if (sys === 'muscular') deepMuscleOpacity = Math.min(deepMuscleOpacity ?? opacity.muscular, BACKGROUND_OPACITY)
        }
      }
      const isolatedIds = s.isolatedIds && ids.every((id) => s.isolatedIds!.has(id)) ? s.isolatedIds : null
      return {
        ...pushHistory(s),
        visible,
        requested: requestVisible(s.requested, visible),
        opacity,
        deepMuscleOpacity,
        peel: null,
        hiddenStructures: withItems(s.hiddenStructures, ids, false),
        transparentStructures: withItems(s.transparentStructures, ids, false),
        isolatedIds,
        selection: { key, ids: new Set(ids) },
        focusRequest: { ids, nonce: (s.focusRequest?.nonce ?? 0) + 1 },
        activePreset: null,
      }
    }),
  applyPreset: (id) =>
    set((s) => {
      const next = presetState(id)
      return { ...pushHistory(s), ...next, requested: requestVisible(s.requested, next.visible) }
    }),
  setTool: (tool) => set({ tool }),
  chooseQuality: (quality) => {
    try {
      localStorage.setItem(QUALITY_KEY, quality)
    } catch {
      // sem armazenamento: vale só para esta sessão
    }
    set({ quality, qualityChosen: true })
  },
  degradeQuality: () => set((s) => (s.qualityChosen || s.quality === 'baixa' ? s : { quality: 'baixa' })),
  undo: () =>
    set((s) => {
      const previous = s.history.at(-1)
      if (!previous) return s
      return { ...previous, requested: requestVisible(s.requested, previous.visible), history: s.history.slice(0, -1) }
    }),
  requestView: (view) => set((s) => ({ viewRequest: { view, nonce: (s.viewRequest?.nonce ?? 0) + 1 } })),
}))
