import { encodeState, initialUrlState } from './urlState'
import { useAnatomyStore } from './useAnatomyStore'

/** Câmera atual (posição + alvo), informada pelo CameraRig quando ela para de se mover. */
let camera: readonly number[] | null = initialUrlState?.camera ?? null
let timer: ReturnType<typeof setTimeout> | undefined

/** Câmera do link aberto, usada no enquadramento inicial no lugar da vista frontal. */
export const initialCamera = initialUrlState?.camera ?? null

function currentHash(): string {
  const s = useAnatomyStore.getState()
  return encodeState({
    visible: s.visible,
    opacity: s.opacity,
    deepMuscleOpacity: s.deepMuscleOpacity,
    peel: s.peel,
    hiddenStructures: s.hiddenStructures,
    transparentStructures: s.transparentStructures,
    isolatedIds: s.isolatedIds,
    selectionKey: s.selection?.key ?? null,
    camera,
  })
}

/** Grava o estado atual no fragmento da URL (sem criar entrada no histórico do navegador). */
export function flushUrl() {
  clearTimeout(timer)
  history.replaceState(null, '', `#${currentHash()}`)
}

function scheduleUrlUpdate() {
  clearTimeout(timer)
  timer = setTimeout(flushUrl, 400)
}

export function setCameraForUrl(position: readonly number[], target: readonly number[]) {
  camera = [...position, ...target]
  scheduleUrlUpdate()
}

/** Mantém a URL sincronizada com a cena; retorna a função que cancela. */
export function startUrlSync(): () => void {
  const unsubscribe = useAnatomyStore.subscribe((s, prev) => {
    // Hover muda a todo instante e não faz parte do link.
    if (s.hoveredId !== prev.hoveredId && s.selection === prev.selection && s.visible === prev.visible) return
    scheduleUrlUpdate()
  })
  return () => {
    unsubscribe()
    clearTimeout(timer)
  }
}
