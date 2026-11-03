import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo } from 'react'
import { Box3, WebGLRenderTarget, type Mesh } from 'three'
import manifest from '../data/models.manifest.json'
import type { SystemId } from '../data/systems'
import { useAnatomyStore } from '../store/useAnatomyStore'
import { addActiveBatches, StructureBatches } from './batching'
import { baseMaterial, resolveMaterial, setLayerOpacity, type MaterialKey } from './materials'
import { meshesByAnatomyId, registerSystem } from './structureRegistry'

// Os GLB usam meshopt (decodificador embutido no three-stdlib); Draco desligado para não buscar o
// decodificador no CDN do Google.
const USE_DRACO = false

// Hash do conteúdo na URL: o Cache Storage (public/sw.js) nunca serve um modelo desatualizado.
const versioned = (file: string) =>
  `${import.meta.env.BASE_URL}models/${file}?v=${(manifest as Record<string, string>)[file] ?? 'dev'}`

export const modelUrl = (system: SystemId) => versioned(`${system}.glb`)

/** Sistemas com versão simplificada (gerada por `npm run models:lod`): os que têm LOD no manifesto. */
const hasLod = (system: SystemId) => `${system}.lod.glb` in manifest
const lodUrl = (system: SystemId) => versioned(`${system}.lod.glb`)

/** Alvo fictício: só para o three escolher a mesma variante de shader usada no pós-processamento. */
const compileTarget = new WebGLRenderTarget(1, 1)

/** `?semlotes` desliga o agrupamento (uma Mesh por estrutura): só para comparação A/B no relatório de desempenho. */
const BATCHING = typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('semlotes')

interface SystemModelProps {
  system: SystemId
  onLoaded: (bounds: Box3) => void
}

/** Um sistema anatômico. Suspende até o GLB chegar; montado só depois que o sistema é ligado pela 1ª vez. */
export function SystemModel({ system, onLoaded }: SystemModelProps) {
  const gltfs = useGLTF(hasLod(system) ? [modelUrl(system), lodUrl(system)] : [modelUrl(system)], USE_DRACO)
  const scene = gltfs[0].scene
  const lodScene = gltfs[1]?.scene
  const visible = useAnatomyStore((s) => s.visible[system])
  const opacity = useAnatomyStore((s) => s.opacity[system])
  const deepOpacity = useAnatomyStore((s) => (system === 'muscular' ? (s.deepMuscleOpacity ?? s.opacity.muscular) : 0))
  const structures = useAnatomyStore((s) => s.structures)
  const groups = useAnatomyStore((s) => s.groups)
  const quality = useAnatomyStore((s) => s.quality)
  const hiddenStructures = useAnatomyStore((s) => s.hiddenStructures)
  const transparentStructures = useAnatomyStore((s) => s.transparentStructures)
  const isolatedIds = useAnatomyStore((s) => s.isolatedIds)
  const hoveredId = useAnatomyStore((s) => s.hoveredId)
  const selectedIds = useAnatomyStore((s) => s.selection?.ids)
  const markLoaded = useAnatomyStore((s) => s.markLoaded)

  const meshes = useMemo(() => registerSystem(system, scene), [system, scene])
  // Partes do encéfalo usam material próprio dentro do sistema nervoso.
  const brainIds = useMemo(
    () => new Set(system === 'nervous' ? (groups.find((g) => g.id === 'grupo_encefalo')?.membros ?? []) : []),
    [system, groups],
  )
  const keyOf = useMemo(() => {
    const keys = new Map<Mesh, MaterialKey>()
    for (const mesh of meshes) {
      const id: string = mesh.userData.anatomyId
      const deep = system === 'muscular' && structures?.get(id)?.camada === 'profunda'
      keys.set(mesh, deep ? 'muscular_deep' : brainIds.has(id) ? 'brain' : system)
    }
    return keys
  }, [meshes, system, structures, brainIds])

  // Malha simplificada equivalente a cada malha completa (mesma estrutura e mesma posição entre as primitivas).
  const lodOf = useMemo(() => {
    if (!lodScene) return () => undefined
    lodScene.updateMatrixWorld(true)
    const lodById = meshesByAnatomyId(lodScene)
    const fullById = meshesByAnatomyId(scene)
    return (mesh: Mesh) => {
      const id: string = mesh.userData.anatomyId
      return lodById.get(id)?.[fullById.get(id)?.indexOf(mesh) ?? -1]
    }
  }, [scene, lodScene])

  // Um lote (BatchedMesh) por material. Refeito quando a camada muscular/encéfalo fica conhecida
  // (os nomes carregam depois do primeiro modelo).
  const batches = useMemo(() => {
    scene.updateMatrixWorld(true)
    // O modelo é estático: sem isso o three recalcula a cada frame as matrizes de milhares de nós.
    scene.traverse((obj) => {
      if (obj !== scene) obj.matrixAutoUpdate = false
    })
    const byKey = new Map<MaterialKey, Mesh[]>()
    for (const mesh of meshes) {
      const key = keyOf.get(mesh)!
      const list = byKey.get(key)
      if (list) list.push(mesh)
      else byKey.set(key, [mesh])
    }
    return new StructureBatches(byKey, (key) => baseMaterial(key, useAnatomyStore.getState().quality), lodOf)
  }, [scene, meshes, keyOf, lodOf])

  useLayoutEffect(() => {
    if (!BATCHING) return
    scene.add(batches.root)
    addActiveBatches(batches)
    return () => batches.dispose()
  }, [scene, batches])

  useLayoutEffect(() => {
    markLoaded(system)
    onLoaded(new Box3().setFromObject(scene))
  }, [scene, system, markLoaded, onLoaded])

  useEffect(() => {
    setLayerOpacity(system, opacity)
    if (system === 'nervous') setLayerOpacity('brain', opacity)
  }, [system, opacity])
  useEffect(() => {
    if (system === 'muscular') setLayerOpacity('muscular_deep', deepOpacity)
  }, [system, deepOpacity])

  useEffect(() => {
    for (const key of new Set(keyOf.values())) batches.setMaterial(key, baseMaterial(key, quality))
    batches.updateSorting()
  }, [batches, keyOf, quality, opacity, deepOpacity])

  // Pré-compila os shaders do sistema (lote e Meshes avulsas usadas no hover/seleção) para o primeiro hover
  // não travar o frame. Na qualidade alta a cena é desenhada num render target do pós-processamento, que gera
  // outra variante de shader (sem tone mapping); por isso compila com um alvo equivalente.
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera)
  const rootScene = useThree((s) => s.scene)
  useEffect(() => {
    const previous = gl.getRenderTarget()
    if (quality === 'alta') gl.setRenderTarget(compileTarget)
    // As Meshes avulsas ficam invisíveis (desenhadas no lote); compile() pularia objetos invisíveis.
    const offscreen = meshes.filter((m) => !m.visible)
    for (const m of offscreen) m.visible = true
    gl.compileAsync(scene, camera, rootScene).catch(() => {})
    for (const m of offscreen) m.visible = false
    gl.setRenderTarget(previous)
  }, [gl, camera, rootScene, scene, meshes, batches, quality])

  useEffect(() => {
    const highlight = { selectedIds, hoveredId, transparentStructures }
    for (const mesh of meshes) {
      const id: string = mesh.userData.anatomyId
      const key = keyOf.get(mesh)!
      const layerOpacity = key === 'muscular_deep' ? deepOpacity : opacity
      // Camada totalmente "descascada" pelo slider não é desenhada (nem recebe hover).
      const shown = layerOpacity > 0 && (isolatedIds ? isolatedIds.has(id) : !hiddenStructures.has(id))
      // Estruturas com material próprio saem do lote e são desenhadas sozinhas.
      const special = id === hoveredId || Boolean(selectedIds?.has(id)) || transparentStructures.has(id)
      mesh.material = resolveMaterial(key, id, quality, highlight)
      mesh.userData.shown = shown
      mesh.visible = BATCHING ? shown && special : shown
      batches.setVisible(mesh, shown && !special)
    }
  }, [meshes, keyOf, batches, quality, opacity, deepOpacity, hiddenStructures, transparentStructures, isolatedIds, hoveredId, selectedIds])

  return <primitive object={scene} visible={visible} />
}
