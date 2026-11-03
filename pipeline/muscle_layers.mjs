// Classifica cada estrutura do sistema muscular em camada superficial ou profunda, para o slider de camadas.
//
// O Z-Anatomy não marca profundidade. A definição usada aqui é geométrica: superficial é o músculo que fica
// visível de fora quando a pele é removida. Dispara-se um grande número de raios aleatórios contra o corpo
// (só malhas musculares; fáscias, bainhas, bolsas e retináculos não bloqueiam) e mede-se a densidade de
// primeiros acertos por área de cada músculo. Fáscias e afins vão para a camada superficial.
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { BufferAttribute, BufferGeometry, Matrix4, Ray, Vector3 } from 'three'
import { MeshBVH } from 'three-mesh-bvh'

/**
 * Densidade de primeiros acertos (por m²) a partir da qual o músculo é superficial. Calibrada com casos
 * conhecidos: deltoide 70–92k, peitoral maior 42–75k, cabeça curta do bíceps 29k, gastrocnêmio 68–79k
 * (superficiais); tibial posterior 27k, braquial 24k, sóleo 22k, glúteo mínimo 18–20k, psoas 4k (profundos).
 * No Z-Anatomy a malha do oblíquo externo inclui a aponeurose e cobre o reto do abdome, que assim fica
 * na camada profunda (como na dissecção, em que a bainha do reto é aberta depois).
 */
export const SUPERFICIAL_DENSITY = 28_000

/** Estruturas do sistema muscular que envolvem os músculos; não contam como obstáculo para os raios. */
export const WRAPPER = /fascia|aponeuros|retinacul|sheath|bursa|linea alba|tendinous|septum|ligament|tract/i

// Gerador determinístico, para a classificação não mudar entre execuções.
function mulberry32(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * @param glbPath caminho de public/models/muscular.glb
 * @param names Map anatomy_id -> nome original (inglês)
 * @returns Map anatomy_id -> { layer: 'superficial'|'profunda', density }
 */
export async function classifyMuscleLayers(glbPath, names, { rays = 400_000, seed = 42 } = {}) {
  await MeshoptDecoder.ready
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
  const doc = await io.read(glbPath)

  const positions = []
  const triOwner = [] // índice do músculo de cada triângulo
  const ids = []
  const area = []
  const a = new Vector3()
  const b = new Vector3()
  const c = new Vector3()
  const m = new Matrix4()

  for (const node of doc.getRoot().listNodes()) {
    const id = node.getExtras().anatomy_id
    const mesh = node.getMesh()
    if (!id || !mesh) continue
    const occluder = !WRAPPER.test(names.get(id) ?? '')
    const owner = ids.length
    ids.push(id)
    area.push(0)
    m.fromArray(node.getWorldMatrix())
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      const index = prim.getIndices()
      const count = index ? index.getCount() : pos.getCount()
      const el = [0, 0, 0]
      const vertex = (i, out) => out.fromArray(pos.getElement(index ? index.getScalar(i) : i, el)).applyMatrix4(m)
      for (let t = 0; t < count; t += 3) {
        vertex(t, a)
        vertex(t + 1, b)
        vertex(t + 2, c)
        area[owner] += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2
        if (!occluder) continue
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
        triOwner.push(owner)
      }
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  // indirect: a BVH não reordena os triângulos, então faceIndex continua apontando para triOwner.
  const bvh = new MeshBVH(geometry, { indirect: true })
  geometry.computeBoundingBox()
  const { min, max } = geometry.boundingBox

  const hits = new Float64Array(ids.length)
  const random = mulberry32(seed)
  const ray = new Ray()
  const target = new Vector3()
  for (let i = 0; i < rays; i++) {
    // Direção uniforme na esfera, apontada para um ponto uniforme dentro da caixa do corpo.
    const z = random() * 2 - 1
    const phi = random() * Math.PI * 2
    const r = Math.sqrt(1 - z * z)
    ray.direction.set(r * Math.cos(phi), z, r * Math.sin(phi))
    target.set(
      min.x + random() * (max.x - min.x),
      min.y + random() * (max.y - min.y),
      min.z + random() * (max.z - min.z),
    )
    ray.origin.copy(target).addScaledVector(ray.direction, -3)
    const hit = bvh.raycastFirst(ray)
    if (hit) hits[triOwner[hit.faceIndex]] += 1
  }

  const result = new Map()
  for (let i = 0; i < ids.length; i++) {
    const density = area[i] > 0 ? hits[i] / area[i] : 0
    const wrapper = WRAPPER.test(names.get(ids[i]) ?? '')
    const layer = wrapper || density >= SUPERFICIAL_DENSITY ? 'superficial' : 'profunda'
    result.set(ids[i], { layer, density, area: area[i], hits: hits[i], wrapper })
  }
  return result
}
