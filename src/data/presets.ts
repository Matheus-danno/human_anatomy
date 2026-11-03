import type { SystemId } from './systems'

export type PresetId = 'corpo_inteiro' | 'musculos' | 'circulacao' | 'orgaos' | 'nervos'

export interface Preset {
  id: PresetId
  label: string
  /** Sistemas ligados pelo preset; todos os outros são desligados (e continuam disponíveis no painel). */
  layers: { system: SystemId; opacity?: number }[]
}

// Esqueleto translúcido serve de referência espacial nos presets em que não é o foco.
const SKELETON_GHOST = { system: 'skeletal', opacity: 0.25 } as const

export const PRESETS: Preset[] = [
  { id: 'corpo_inteiro', label: 'Corpo inteiro', layers: [{ system: 'skin' }] },
  { id: 'musculos', label: 'Músculos', layers: [{ system: 'skeletal' }, { system: 'muscular' }] },
  {
    id: 'circulacao',
    label: 'Circulação',
    layers: [SKELETON_GHOST, { system: 'arteries' }, { system: 'veins' }],
  },
  {
    id: 'orgaos',
    label: 'Órgãos',
    layers: [
      SKELETON_GHOST,
      { system: 'respiratory' },
      { system: 'digestive' },
      { system: 'urinary' },
      { system: 'reproductive' },
      { system: 'endocrine' },
    ],
  },
  { id: 'nervos', label: 'Nervos', layers: [SKELETON_GHOST, { system: 'nervous' }, { system: 'sense_organs' }] },
]

export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p])) as Record<PresetId, Preset>

export const INITIAL_PRESET: PresetId = 'corpo_inteiro'
