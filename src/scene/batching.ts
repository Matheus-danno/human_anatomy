import { BatchedMesh, BufferGeometry, Group, Matrix4, Vector3, type Material, type Mesh } from 'three'
import type { MaterialKey } from './materials'

// Desenhar cada estrutura como uma Mesh separada custava ~4.300 draw calls por frame com todos os sistemas
// ligados, e o frame ficava preso na CPU. Aqui as estruturas de um sistema que compartilham o mesmo
// material vão para um BatchedMesh (uma chamada multi-draw), com visibilidade por instância.
//
// As Meshes originais continuam na cena, invisíveis por padrão: servem de alvo para o raycast (BVH) e são
// desenhadas sozinhas só quando precisam de material próprio (hover, seleção, "Transparente").

/** Atributos que os materiais usam; o lote exige o mesmo formato em todas as geometrias. */
const ATTRIBUTES = ['position', 'normal']

function batchable(geometry: BufferGeometry): BufferGeometry {
  if (Object.keys(geometry.attributes).every((name) => ATTRIBUTES.includes(name))) return geometry
  // Algumas malhas trazem COLOR_0 ou TEXCOORD_0 do Z-Anatomy, que não são usados.
  const stripped = new BufferGeometry()
  for (const name of ATTRIBUTES) stripped.setAttribute(name, geometry.getAttribute(name))
  stripped.setIndex(geometry.getIndex())
  return stripped
}

const MIRROR_X = new Matrix4().makeScale(-1, 1, 1)

/**
 * Ordem de desenho dos lotes opacos, de fora para dentro do corpo. Sem ela a GPU sombreava camadas internas
 * que depois eram cobertas (com 13 sistemas o frame era limitado por pixels sombreados, não por triângulos);
 * desenhando a pele e os músculos primeiro, o teste de profundidade descarta cedo o que fica escondido.
 */
const DRAW_ORDER: Record<MaterialKey, number> = {
  skin: 0,
  muscular: 1,
  muscular_deep: 2,
  skeletal: 3,
  arteries: 4,
  veins: 4,
  lymphatic: 4,
  nervous: 4,
  sense_organs: 5,
  respiratory: 5,
  digestive: 5,
  urinary: 5,
  reproductive: 5,
  endocrine: 5,
  brain: 5,
}

/**
 * Os lados esquerdo e direito do Z-Anatomy compartilham a geometria, espelhada por uma matriz com escala
 * negativa. Numa Mesh comum o three inverte a orientação das faces nesse caso; no BatchedMesh não há isso
 * por instância, e a estrutura apareceria "do avesso". Por isso o espelho vai para a geometria: x e
 * normal.x negados e a ordem dos vértices de cada triângulo invertida; a instância usa matriz × espelho.
 */
function mirrored(geometry: BufferGeometry): BufferGeometry {
  const out = new BufferGeometry()
  for (const name of ATTRIBUTES) {
    const attribute = geometry.getAttribute(name).clone()
    for (let i = 0; i < attribute.count; i++) attribute.setX(i, -attribute.getX(i))
    out.setAttribute(name, attribute)
  }
  const index = geometry.getIndex()!.clone()
  for (let i = 0; i < index.count; i += 3) {
    const b = index.getX(i + 1)
    index.setX(i + 1, index.getX(i + 2))
    index.setX(i + 2, b)
  }
  out.setIndex(index)
  return out
}

/**
 * Distância (m) da câmera ao centro da estrutura a partir da qual ela usa o LOD, com histerese para não
 * alternar na fronteira. Na vista do corpo inteiro (~3,5 m) tudo fica no LOD; ao aproximar de uma região,
 * só ela ganha a malha completa.
 */
const LOD_DISTANCE = 1.2
const LOD_HYSTERESIS = 0.1

interface Variant {
  geometryId: number
  matrix: Matrix4
}

interface Instance {
  batch: BatchedMesh
  id: number
  full: Variant
  lod?: Variant
  center: Vector3
  usingLod: boolean
}

/**
 * Lotes de todos os sistemas montados, para o controlador de LOD (ver LodController). `version` muda a cada
 * lote criado ou removido: lotes recriados (quando os nomes carregam) nascem com a malha completa e precisam
 * ser reavaliados mesmo que a quantidade de lotes não mude.
 */
export const activeBatches = new Set<StructureBatches>()
export const batchesState = { version: 0 }

export function addActiveBatches(batches: StructureBatches) {
  activeBatches.add(batches)
  batchesState.version++
}

export class StructureBatches {
  readonly root = new Group()
  private readonly batches = new Map<MaterialKey, BatchedMesh>()
  private readonly instances = new Map<Mesh, Instance>()

  /**
   * `groups`: malhas por material; `lodOf`: malha simplificada equivalente (mesma estrutura), se houver.
   * As matrizes de mundo das malhas precisam estar atualizadas.
   */
  constructor(groups: Map<MaterialKey, Mesh[]>, materialFor: (key: MaterialKey) => Material, lodOf: (mesh: Mesh) => Mesh | undefined = () => undefined) {
    this.root.name = 'lotes'
    for (const [key, meshes] of groups) {
      // Uma cópia por geometria e orientação (normal ou espelhada), compartilhada pelas instâncias.
      const variantKey = (mesh: Mesh) => `${mesh.geometry.uuid}:${mesh.matrixWorld.determinant() < 0 ? 'espelho' : 'normal'}`
      const sources = meshes.flatMap((mesh) => [mesh, lodOf(mesh)].filter((m): m is Mesh => Boolean(m)))
      const unique = new Map<string, BufferGeometry>()
      let vertexCount = 0
      let indexCount = 0
      for (const mesh of sources) {
        const k = variantKey(mesh)
        if (unique.has(k)) continue
        const base = batchable(mesh.geometry)
        const geometry = k.endsWith('espelho') ? mirrored(base) : base
        unique.set(k, geometry)
        vertexCount += geometry.getAttribute('position').count
        indexCount += geometry.getIndex()?.count ?? 0
      }
      const batch = new BatchedMesh(meshes.length, vertexCount, indexCount, materialFor(key))
      batch.name = `lote:${key}`
      // Sem recorte de visão por instância: o corpo costuma estar inteiro na tela, e com ele ligado o lote
      // refaz a lista de desenho e a reenvia à GPU a cada frame. A ordenação por instância só é ligada quando
      // o material fica translúcido (setMaterial), onde ela é necessária.
      batch.perObjectFrustumCulled = false
      batch.sortObjects = false
      batch.matrixAutoUpdate = false
      batch.renderOrder = DRAW_ORDER[key]
      const geometryIds = new Map<string, number>()
      for (const [k, geometry] of unique) geometryIds.set(k, batch.addGeometry(geometry))
      // O LOD foi requantizado: cada variante tem sua própria matriz de dequantização.
      const variant = (mesh: Mesh): Variant => {
        const k = variantKey(mesh)
        const matrix = mesh.matrixWorld.clone()
        if (k.endsWith('espelho')) matrix.multiply(MIRROR_X)
        return { geometryId: geometryIds.get(k)!, matrix }
      }
      for (const mesh of meshes) {
        const full = variant(mesh)
        const lodMesh = lodOf(mesh)
        const id = batch.addInstance(full.geometryId)
        batch.setMatrixAt(id, full.matrix)
        if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
        const center = mesh.geometry.boundingSphere!.center.clone().applyMatrix4(mesh.matrixWorld)
        this.instances.set(mesh, { batch, id, full, lod: lodMesh && variant(lodMesh), center, usingLod: false })
      }
      this.batches.set(key, batch)
      this.root.add(batch)
    }
  }

  /** Escolhe, por estrutura, a malha completa (perto da câmera) ou a simplificada (longe). */
  updateLod(cameraPosition: Vector3) {
    for (const instance of this.instances.values()) {
      if (!instance.lod) continue
      const distance = instance.center.distanceTo(cameraPosition)
      const useLod = instance.usingLod ? distance > LOD_DISTANCE - LOD_HYSTERESIS : distance > LOD_DISTANCE + LOD_HYSTERESIS
      if (useLod === instance.usingLod) continue
      const variant = useLod ? instance.lod : instance.full
      instance.batch.setGeometryIdAt(instance.id, variant.geometryId)
      instance.batch.setMatrixAt(instance.id, variant.matrix)
      instance.usingLod = useLod
    }
  }

  setVisible(mesh: Mesh, visible: boolean) {
    const instance = this.instances.get(mesh)
    if (instance && instance.batch.getVisibleAt(instance.id) !== visible) instance.batch.setVisibleAt(instance.id, visible)
  }

  setMaterial(key: MaterialKey, material: Material) {
    const batch = this.batches.get(key)
    if (batch && batch.material !== material) batch.material = material
  }

  /** Liga a ordenação por instância nos lotes translúcidos (chamar quando a opacidade muda). */
  updateSorting() {
    for (const batch of this.batches.values()) {
      const transparent = (batch.material as Material).transparent
      if (batch.sortObjects !== transparent) batch.sortObjects = transparent
    }
  }

  get drawCalls() {
    return this.batches.size
  }

  dispose() {
    activeBatches.delete(this)
    batchesState.version++
    for (const batch of this.batches.values()) batch.dispose()
    this.root.removeFromParent()
  }
}
