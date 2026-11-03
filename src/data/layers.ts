import type { SystemId } from './systems'

/** Camadas do slider, de fora para dentro. O slider vai de 0 (tudo) a PEEL_MAX (só o esqueleto). */
export const PEEL_LAYERS = [
  { id: 'pele', label: 'Pele' },
  { id: 'musculos_superficiais', label: 'Músculos superficiais' },
  { id: 'musculos_profundos', label: 'Músculos profundos' },
  { id: 'orgaos', label: 'Órgãos' },
  { id: 'esqueleto', label: 'Esqueleto' },
] as const

export const PEEL_MAX = PEEL_LAYERS.length - 1

export const ORGAN_SYSTEMS: SystemId[] = ['respiratory', 'digestive', 'urinary', 'reproductive', 'endocrine']

/**
 * Opacidade da camada `index` para a posição `peel` do slider: inteira até chegar nela, some ao longo do
 * trecho [index, index + 1]. A última camada (esqueleto) nunca some.
 */
export function layerOpacity(peel: number, index: number): number {
  if (index >= PEEL_MAX) return 1
  return Math.min(1, Math.max(0, 1 - (peel - index)))
}
