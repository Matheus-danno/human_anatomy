import { MeshPhysicalMaterial, MeshStandardMaterial, ShaderChunk } from 'three'
import { SYSTEM_BY_ID, type SystemId } from '../data/systems'
import type { Quality } from '../store/useAnatomyStore'

// Os materiais exportados do Z-Anatomy não servem: o exportador glTF do Blender não traduz os shaders
// dele e gera base branca com emissão [1,1,1] (e metalicidade 0,5 em ossos/músculos). Cada sistema
// recebe um conjunto próprio de materiais, compartilhado por todas as suas malhas — assim a opacidade do
// sistema é uma única alteração e destacar uma estrutura é só trocar a variante que ela usa.
//
// Qualidade "alta": MeshPhysicalMaterial (sheen, clearcoat, subsurface simulado na pele).
// Qualidade "baixa": MeshStandardMaterial com as mesmas cores, sem custo extra de shader.

/** Opacidade de uma estrutura marcada como "Transparente": abaixo de 0,2, então o hover a atravessa. */
export const GHOST_OPACITY = 0.15

/**
 * Um sistema, a camada muscular profunda (que o slider de camadas some separadamente) ou o encéfalo
 * (sistema nervoso central, em bege rosado em vez do amarelo dos nervos).
 */
export type MaterialKey = SystemId | 'muscular_deep' | 'brain'

type Material = MeshStandardMaterial | MeshPhysicalMaterial

interface MaterialSet {
  base: Material
  hover: Material
  selected: Material
  ghost: Material
}

// Aparência na qualidade alta. Cores e rugosidade de base vêm de data/systems.ts quando não definidas aqui.
const PHYSICAL: Partial<Record<MaterialKey, ConstructorParameters<typeof MeshPhysicalMaterial>[0]>> = {
  skin: { color: '#dcaa8e', roughness: 0.55, sheen: 0.7, sheenColor: '#ffb4a0', sheenRoughness: 0.5, clearcoat: 0.06, clearcoatRoughness: 0.6 },
  skeletal: { color: '#e9dfc8', roughness: 0.85, sheen: 0.15, sheenColor: '#fff3d6', sheenRoughness: 0.8 },
  muscular: { color: '#a3302a', roughness: 0.5, sheen: 0.6, sheenColor: '#ff8a7a', sheenRoughness: 0.35, clearcoat: 0.25, clearcoatRoughness: 0.35 },
  muscular_deep: { color: '#8f2823', roughness: 0.5, sheen: 0.6, sheenColor: '#ff8a7a', sheenRoughness: 0.35, clearcoat: 0.25, clearcoatRoughness: 0.35 },
  arteries: { color: '#c0262b', roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.25 },
  veins: { color: '#2f4f9e', roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.25 },
  lymphatic: { color: '#7fae5a', roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3 },
  nervous: { color: '#e8c95a', roughness: 0.45, sheen: 0.3, sheenColor: '#fff0b0', sheenRoughness: 0.5 },
  brain: { color: '#e3b8a6', roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.35, sheen: 0.3, sheenColor: '#ffd8c8' },
  sense_organs: { color: '#dcdcdc', roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.15 },
  respiratory: { color: '#e09a9a', roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.3 },
  digestive: { color: '#cf8466', roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.25 },
  urinary: { color: '#a8553f', roughness: 0.45, clearcoat: 0.45, clearcoatRoughness: 0.25 },
  reproductive: { color: '#c98293', roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.25 },
  endocrine: { color: '#9a6fb0', roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.25 },
}

const baseSystem = (key: MaterialKey): SystemId =>
  key === 'muscular_deep' ? 'muscular' : key === 'brain' ? 'nervous' : key

// Subsurface simulado ("wrap lighting"): a luz direta contorna um pouco o terminador e a faixa de
// transição ganha um tom avermelhado, como a luz que atravessa a pele. Bem mais barato que transmissão.
const IRRADIANCE_LINE = 'vec3 irradiance = dotNL * directLight.color;'
const SKIN_IRRADIANCE = `
  float wrapNL = saturate( ( dot( geometryNormal, directLight.direction ) + 0.45 ) / 1.45 );
  vec3 scatter = vec3( 1.0, 0.45, 0.35 ) * max( wrapNL - dotNL, 0.0 );
  vec3 irradiance = ( dotNL + scatter * 0.6 ) * directLight.color;`

function applySkinShading(material: MeshPhysicalMaterial) {
  material.onBeforeCompile = (shader) => {
    const chunk = ShaderChunk.lights_physical_pars_fragment
    if (!chunk.includes(IRRADIANCE_LINE)) return // three mudou o chunk: fica sem o efeito, sem quebrar
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <lights_physical_pars_fragment>',
      chunk.replace(IRRADIANCE_LINE, SKIN_IRRADIANCE),
    )
  }
  material.customProgramCacheKey = () => 'skin-subsurface'
}

function createMaterial(key: MaterialKey, quality: Quality): Material {
  const { color, roughness } = SYSTEM_BY_ID[baseSystem(key)]
  if (quality === 'baixa') return new MeshStandardMaterial({ color, roughness, metalness: 0 })
  const material = new MeshPhysicalMaterial({ color, roughness, metalness: 0, ...PHYSICAL[key] })
  if (key === 'skin') applySkinShading(material)
  return material
}

const cache = new Map<string, MaterialSet>()
/** Última opacidade pedida por camada, para materiais criados depois (troca de qualidade). */
const layerOpacity = new Map<MaterialKey, number>()

function setOpacity(material: Material, opacity: number) {
  const transparent = opacity < 0.999
  if (material.transparent !== transparent) material.needsUpdate = true
  material.transparent = transparent
  material.opacity = opacity
  // Sem escrita de profundidade quando translúcido, para enxergar o que está dentro/atrás.
  material.depthWrite = !transparent
}

function applyOpacity({ base, hover, selected, ghost }: MaterialSet, opacity: number) {
  for (const material of [base, hover, selected]) setOpacity(material, opacity)
  setOpacity(ghost, Math.min(opacity, GHOST_OPACITY))
}

function materialSet(key: MaterialKey, quality: Quality): MaterialSet {
  const cacheKey = `${key}:${quality}`
  let materials = cache.get(cacheKey)
  if (!materials) {
    const variant = (name: string) => {
      const m = createMaterial(key, quality)
      m.name = `${cacheKey}:${name}`
      return m
    }
    const hover = variant('hover')
    hover.emissive.set('#ffffff')
    hover.emissiveIntensity = 0.18
    const selected = variant('selected')
    selected.emissive.set('#38bdf8')
    selected.emissiveIntensity = 0.45
    materials = { base: variant('base'), hover, selected, ghost: variant('ghost') }
    applyOpacity(materials, layerOpacity.get(key) ?? 1)
    cache.set(cacheKey, materials)
  }
  return materials
}

export function setLayerOpacity(key: MaterialKey, opacity: number) {
  layerOpacity.set(key, opacity)
  for (const quality of ['alta', 'baixa'] as const) {
    const materials = cache.get(`${key}:${quality}`)
    if (materials) applyOpacity(materials, opacity)
  }
}

interface HighlightState {
  selectedIds: ReadonlySet<string> | undefined
  hoveredId: string | null
  transparentStructures: ReadonlySet<string>
}

/** Material normal da camada (o que os lotes de BatchedMesh usam). */
export function baseMaterial(key: MaterialKey, quality: Quality): Material {
  return materialSet(key, quality).base
}

export function resolveMaterial(key: MaterialKey, id: string, quality: Quality, state: HighlightState): Material {
  const materials = materialSet(key, quality)
  if (state.selectedIds?.has(id)) return materials.selected
  if (id === state.hoveredId) return materials.hover
  if (state.transparentStructures.has(id)) return materials.ghost
  return materials.base
}
