// Os ids são os nomes dos GLB em public/models/ e o campo "system" de structures.raw.json.
export type SystemId =
  | 'skin'
  | 'skeletal'
  | 'muscular'
  | 'arteries'
  | 'veins'
  | 'lymphatic'
  | 'nervous'
  | 'sense_organs'
  | 'respiratory'
  | 'digestive'
  | 'urinary'
  | 'reproductive'
  | 'endocrine'

export type SystemGroupId = 'superficie' | 'locomotor' | 'circulacao' | 'nervoso' | 'orgaos'

export interface SystemInfo {
  id: SystemId
  label: string
  group: SystemGroupId
  /** Cor do material provisório (ver scene/materials.ts) e do ícone no painel. */
  color: string
  roughness: number
}

export const SYSTEM_GROUPS: { id: SystemGroupId; label: string }[] = [
  { id: 'superficie', label: 'Superfície' },
  { id: 'locomotor', label: 'Locomotor' },
  { id: 'circulacao', label: 'Circulação' },
  { id: 'nervoso', label: 'Nervoso' },
  { id: 'orgaos', label: 'Órgãos' },
]

export const SYSTEMS: SystemInfo[] = [
  { id: 'skin', label: 'Pele', group: 'superficie', color: '#d9a98c', roughness: 0.65 },
  { id: 'skeletal', label: 'Sistema esquelético', group: 'locomotor', color: '#e6dcc6', roughness: 0.75 },
  { id: 'muscular', label: 'Sistema muscular', group: 'locomotor', color: '#a8332c', roughness: 0.55 },
  // O coração está no GLB de artérias (o Z-Anatomy não tem coleção própria para ele).
  { id: 'arteries', label: 'Artérias e coração', group: 'circulacao', color: '#c0262b', roughness: 0.45 },
  { id: 'veins', label: 'Veias', group: 'circulacao', color: '#2f4f9e', roughness: 0.45 },
  { id: 'lymphatic', label: 'Sistema linfático', group: 'circulacao', color: '#7fae5a', roughness: 0.55 },
  { id: 'nervous', label: 'Sistema nervoso', group: 'nervoso', color: '#e8c95a', roughness: 0.5 },
  { id: 'sense_organs', label: 'Órgãos dos sentidos', group: 'nervoso', color: '#d8d8d8', roughness: 0.4 },
  { id: 'respiratory', label: 'Sistema respiratório', group: 'orgaos', color: '#d98c8c', roughness: 0.6 },
  { id: 'digestive', label: 'Sistema digestório', group: 'orgaos', color: '#c97a63', roughness: 0.55 },
  { id: 'urinary', label: 'Sistema urinário', group: 'orgaos', color: '#b5654d', roughness: 0.55 },
  { id: 'reproductive', label: 'Sistema reprodutor', group: 'orgaos', color: '#c98293', roughness: 0.55 },
  { id: 'endocrine', label: 'Sistema endócrino', group: 'orgaos', color: '#9a6fb0', roughness: 0.55 },
]

export const SYSTEM_IDS = SYSTEMS.map((s) => s.id)

export const SYSTEM_BY_ID = Object.fromEntries(SYSTEMS.map((s) => [s.id, s])) as Record<SystemId, SystemInfo>
