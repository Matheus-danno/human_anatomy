import { useEffect, useRef } from 'react'
import { useAnatomyStore } from '../store/useAnatomyStore'

const OFFSET_PX = 16
const lastPointer = { x: 0, y: 0 }

/** Segue o cursor por manipulação direta do DOM (sem re-render do React a cada movimento). */
export function Tooltip() {
  const hoveredId = useAnatomyStore((s) => s.hoveredId)
  const info = useAnatomyStore((s) => (s.hoveredId ? s.structures?.get(s.hoveredId) : undefined))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const place = () => {
      const el = ref.current
      if (!el) return
      let x = lastPointer.x + OFFSET_PX
      let y = lastPointer.y + OFFSET_PX
      if (x + el.offsetWidth > window.innerWidth - 8) x = lastPointer.x - el.offsetWidth - OFFSET_PX
      if (y + el.offsetHeight > window.innerHeight - 8) y = lastPointer.y - el.offsetHeight - OFFSET_PX
      el.style.transform = `translate(${x}px, ${y}px)`
    }
    const onMove = (e: PointerEvent) => {
      lastPointer.x = e.clientX
      lastPointer.y = e.clientY
      place()
    }
    place()
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [hoveredId])

  if (!hoveredId) return null

  return (
    <div
      ref={ref}
      role="tooltip"
      className="pointer-events-none fixed left-0 top-0 z-20 max-w-xs rounded-md bg-slate-950/90 px-3 py-2 shadow-lg ring-1 ring-white/10"
    >
      <p className="text-sm font-semibold text-slate-50">{info?.nomePt ?? hoveredId}</p>
      {info?.nomeLatim && <p className="text-xs italic text-slate-400">{info.nomeLatim}</p>}
    </div>
  )
}
