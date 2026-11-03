import { useFrame, useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { hoverStats } from './HoverController'

/** `?perf` na URL: expõe estatísticas do renderer e do hover em window.__perf para o relatório de desempenho. */
export const PERF_ENABLED = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf')

// Totais do último frame completo (cena + pós-processamento + gizmo). O three zera gl.info a cada
// gl.render(); com autoReset desligado acumulamos tudo e zeramos uma vez por frame.
const frameStats = { calls: 0, triangles: 0 }

export function PerfProbe() {
  const gl = useThree((s) => s.gl)

  useEffect(() => {
    if (!PERF_ENABLED) return
    gl.info.autoReset = false
    const ctx = gl.getContext()
    const ext = ctx.getExtension('WEBGL_debug_renderer_info')
    ;(window as unknown as { __perf: unknown }).__perf = {
      gl,
      info: gl.info,
      frame: frameStats,
      hover: hoverStats,
      renderer: ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER),
    }
  }, [gl])

  // Roda antes do render do frame atual: o que está em gl.info é o frame anterior inteiro.
  useFrame(() => {
    if (!PERF_ENABLED) return
    frameStats.calls = gl.info.render.calls
    frameStats.triangles = gl.info.render.triangles
    gl.info.reset()
  })

  return null
}
