import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Box3, MathUtils, Sphere, Spherical, Vector3, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useAnatomyStore, type ViewName } from '../store/useAnatomyStore'
import { initialCamera, setCameraForUrl } from '../store/urlSync'
import { meshesById } from './structureRegistry'

interface View {
  position: Vector3
  target: Vector3
}

const FIT_MARGIN = 1.15
const FOCUS_MARGIN = 1.4
/** Distância mínima da câmera (m): permite chegar perto de estruturas pequenas, como os ossículos. */
const MIN_DISTANCE = 0.03

// Direção da câmera a partir do corpo (glTF: +Y para cima, frente do corpo em +Z, lado esquerdo do corpo
// em +X). "Cima" tem um leve desvio em Z para o OrbitControls não ficar num polo (e a frente ficar embaixo).
const VIEW_DIRECTIONS: Record<ViewName, Vector3> = {
  frente: new Vector3(0, 0, 1),
  costas: new Vector3(0, 0, -1),
  esquerda: new Vector3(1, 0, 0),
  direita: new Vector3(-1, 0, 0),
  cima: new Vector3(0, 1, 0.001).normalize(),
}

/** Vista padrão que enquadra a caixa inteira na tela atual. */
function standardView(bounds: Box3, camera: PerspectiveCamera, view: ViewName): View {
  const center = bounds.getCenter(new Vector3())
  const size = bounds.getSize(new Vector3())
  const vFov = MathUtils.degToRad(camera.fov)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
  // Extensões na tela (vertical, horizontal) e em profundidade para cada vista.
  const [vertical, horizontal, depth] =
    view === 'cima' ? [size.z, size.x, size.y] : view === 'frente' || view === 'costas' ? [size.y, size.x, size.z] : [size.y, size.z, size.x]
  const distance =
    Math.max(vertical / 2 / Math.tan(vFov / 2), horizontal / 2 / Math.tan(hFov / 2)) * FIT_MARGIN + depth / 2
  return { position: center.clone().addScaledVector(VIEW_DIRECTIONS[view], distance), target: center }
}

/** Enquadra a esfera envolvente das estruturas mantendo a direção de onde a câmera olha agora. */
function focusView(sphere: Sphere, camera: PerspectiveCamera, target: Vector3): View {
  const vFov = MathUtils.degToRad(camera.fov)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
  const distance = Math.max((sphere.radius / Math.sin(Math.min(vFov, hFov) / 2)) * FOCUS_MARGIN, MIN_DISTANCE * 2)
  const direction = camera.position.clone().sub(target).normalize()
  return { position: sphere.center.clone().addScaledVector(direction, distance), target: sphere.center.clone() }
}

/** Esfera envolvente das estruturas, ou null se alguma ainda não foi carregada. */
function boundsOf(ids: readonly string[]): Sphere | null {
  const box = new Box3()
  for (const id of ids) {
    const meshes = meshesById.get(id)
    if (!meshes) return null
    for (const mesh of meshes) box.expandByObject(mesh)
  }
  return box.isEmpty() ? null : box.getBoundingSphere(new Sphere())
}

export function CameraRig({ bounds }: { bounds: Box3 }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null
  const viewRequest = useAnatomyStore((s) => s.viewRequest)
  const focusRequest = useAnatomyStore((s) => s.focusRequest)
  const goal = useRef<View | null>(null)
  const pendingFocus = useRef<readonly string[] | null>(null)

  const reportCamera = () => {
    if (controls) setCameraForUrl(camera.position.toArray(), controls.target.toArray())
  }

  // Enquadramento inicial (instantâneo): a câmera do link, se houver, senão a vista frontal.
  useEffect(() => {
    if (!controls) return
    const front = standardView(bounds, camera, 'frente')
    if (initialCamera) {
      camera.position.fromArray(initialCamera, 0)
      controls.target.fromArray(initialCamera, 3)
    } else {
      camera.position.copy(front.position)
      controls.target.copy(front.target)
    }
    controls.minDistance = MIN_DISTANCE
    controls.maxDistance = front.position.distanceTo(front.target) * 2.5
    controls.update()
  }, [bounds, camera, controls])

  useEffect(() => {
    if (viewRequest) goal.current = standardView(bounds, camera, viewRequest.view)
  }, [viewRequest, bounds, camera])

  useEffect(() => {
    if (focusRequest) pendingFocus.current = focusRequest.ids
  }, [focusRequest])

  // Se o usuário pegar o mouse durante a animação, ele assume o controle; ao soltar, a câmera vai para o link.
  useEffect(() => {
    if (!controls) return
    const cancel = () => {
      goal.current = null
      pendingFocus.current = null
    }
    const report = () => setCameraForUrl(camera.position.toArray(), controls.target.toArray())
    controls.addEventListener('start', cancel)
    controls.addEventListener('end', report)
    return () => {
      controls.removeEventListener('start', cancel)
      controls.removeEventListener('end', report)
    }
  }, [camera, controls])

  useFrame((_, delta) => {
    if (!controls) return

    // O sistema da estrutura pode ainda estar baixando: tenta a cada frame até as malhas existirem.
    if (pendingFocus.current) {
      const sphere = boundsOf(pendingFocus.current)
      if (sphere) {
        goal.current = focusView(sphere, camera, controls.target)
        pendingFocus.current = null
      }
    }

    // Anima em coordenadas esféricas em torno do alvo, para orbitar sem atravessar o corpo.
    const view = goal.current
    if (!view) return
    const k = 1 - Math.exp(-delta * 6)
    const current = new Spherical().setFromVector3(camera.position.clone().sub(controls.target))
    const wanted = new Spherical().setFromVector3(view.position.clone().sub(view.target))
    const dTheta = MathUtils.euclideanModulo(wanted.theta - current.theta + Math.PI, Math.PI * 2) - Math.PI
    current.theta += dTheta * k
    current.phi += (wanted.phi - current.phi) * k
    current.radius += (wanted.radius - current.radius) * k
    controls.target.lerp(view.target, k)
    camera.position.setFromSpherical(current).add(controls.target)

    if (camera.position.distanceTo(view.position) < 1e-3 && controls.target.distanceTo(view.target) < 1e-3) {
      camera.position.copy(view.position)
      controls.target.copy(view.target)
      goal.current = null
      controls.update()
      reportCamera()
      return
    }
    controls.update()
  })

  return null
}
