import { BufferGeometry, Mesh, type Object3D } from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import type { SystemId } from '../data/systems'

// Raycast acelerado por BVH em todas as malhas (hover/seleção em milhares de estruturas).
BufferGeometry.prototype.computeBoundsTree = computeBoundsTree
BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree
Mesh.prototype.raycast = acceleratedRaycast

/** Malhas de cada sistema carregado; cada uma tem userData.anatomyId e userData.system. */
export const meshesBySystem = new Map<SystemId, Mesh[]>()
/** Malhas de cada estrutura (mais de uma quando o objeto tinha vários materiais). */
export const meshesById = new Map<string, Mesh[]>()

// O anatomy_id vem nos extras do nó glTF. Objetos com vários materiais viram um Group com uma
// Mesh por primitiva, e aí o id fica no Group pai.
function findAnatomyId(obj: Object3D): string | undefined {
  for (let o: Object3D | null = obj; o; o = o.parent) {
    if (typeof o.userData.anatomy_id === 'string') return o.userData.anatomy_id
  }
  return undefined
}

/** Malhas de uma cena agrupadas por anatomy_id, na ordem em que aparecem (sem BVH nem registro global). */
export function meshesByAnatomyId(scene: Object3D): Map<string, Mesh[]> {
  const byId = new Map<string, Mesh[]>()
  scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    const id = findAnatomyId(obj)
    if (!id) return
    const list = byId.get(id)
    if (list) list.push(obj)
    else byId.set(id, [obj])
  })
  return byId
}

/** Constrói o BVH da malha se ainda não existir (o hover chama antes do raycast). */
export function ensureBoundsTree(mesh: Mesh) {
  if (!mesh.geometry.boundsTree) mesh.geometry.computeBoundsTree()
}

// O BVH só serve ao hover, e construí-lo para todas as malhas ao carregar atrasava a primeira tela em
// segundos. Ele é construído depois, em pedaços, nos intervalos ociosos do navegador.
const pendingBvh: Mesh[] = []
let bvhScheduled = false

const whenIdle = (work: (deadline: { timeRemaining: () => number }) => void) =>
  'requestIdleCallback' in window ? requestIdleCallback(work, { timeout: 1000 }) : setTimeout(() => work({ timeRemaining: () => 8 }), 16)

function buildPendingBvh(deadline: { timeRemaining: () => number }) {
  while (pendingBvh.length && deadline.timeRemaining() > 2) ensureBoundsTree(pendingBvh.pop()!)
  if (pendingBvh.length) whenIdle(buildPendingBvh)
  else bvhScheduled = false
}

/** Indexa as malhas de um sistema e agenda o BVH delas. Idempotente (a cena do useGLTF fica em cache). */
export function registerSystem(system: SystemId, scene: Object3D): Mesh[] {
  const existing = meshesBySystem.get(system)
  if (existing) return existing

  const meshes: Mesh[] = []
  scene.traverse((obj) => {
    if (!(obj instanceof Mesh)) return
    const id = findAnatomyId(obj)
    if (!id) return
    obj.userData.anatomyId = id
    obj.userData.system = system
    meshes.push(obj)
    const forId = meshesById.get(id)
    if (forId) forId.push(obj)
    else meshesById.set(id, [obj])
  })
  meshesBySystem.set(system, meshes)
  pendingBvh.push(...meshes)
  if (!bvhScheduled) {
    bvhScheduled = true
    whenIdle(buildPendingBvh)
  }
  return meshes
}
