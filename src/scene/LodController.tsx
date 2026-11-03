import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import { Vector3 } from 'three'
import { activeBatches, batchesState } from './batching'

/** Intervalo mínimo entre reavaliações do LOD (ms); só reavalia quando a câmera se moveu ou os lotes mudaram. */
const INTERVAL_MS = 150

/** Escolhe malha completa ou simplificada para cada estrutura conforme a distância à câmera. */
export function LodController() {
  const last = useRef({ position: new Vector3(Infinity, 0, 0), time: 0, version: -1 })

  useFrame(({ camera, clock }) => {
    const state = last.current
    const now = clock.elapsedTime * 1000
    const changed = camera.position.distanceToSquared(state.position) > 1e-6 || state.version !== batchesState.version
    if (!changed || now - state.time < INTERVAL_MS) return
    for (const batches of activeBatches) batches.updateLod(camera.position)
    state.position.copy(camera.position)
    state.time = now
    state.version = batchesState.version
  })

  return null
}
