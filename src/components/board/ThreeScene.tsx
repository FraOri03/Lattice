import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/**
 * The placeholder three.js scene for `embed3d` cards.
 *
 * This module is the ONLY place (besides the asset ThreeDViewer) that pulls
 * in three.js, and it is loaded exclusively via React.lazy — so three.js
 * lives in its own chunk and never in the main bundle (PERF-1).
 *
 * The animation loop is fully suspended when `active` is false — off-screen,
 * page hidden, or over the live-viewer budget (PERF-2): no requestAnimationFrame
 * ticks and no OrbitControls auto-rotate run. It resumes when `active` flips
 * back to true. Everything is disposed on unmount (renderer, geometry,
 * material, controls, observer, frame).
 */
export default function ThreeScene({
  color,
  active,
}: {
  color: string
  active: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const matRef = useRef<THREE.MeshStandardMaterial | null>(null)
  const activeRef = useRef(active)
  const resumeRef = useRef<() => void>(() => {})

  useEffect(() => {
    const host = hostRef.current!
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    camera.position.set(0, 1.4, 4.2)

    scene.add(new THREE.AmbientLight(0xffffff, 0.7))
    const key = new THREE.DirectionalLight(0xffffff, 1.8)
    key.position.set(3, 4, 5)
    scene.add(key)

    const geo = new THREE.TorusKnotGeometry(0.9, 0.3, 140, 20)
    const mat = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.35,
      roughness: 0.25,
    })
    matRef.current = mat
    scene.add(new THREE.Mesh(geo, mat))

    const grid = new THREE.GridHelper(10, 20, 0x555555, 0x3a3a3a)
    grid.position.y = -1.5
    scene.add(grid)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.autoRotate = true
    controls.autoRotateSpeed = 1.5

    let raf = 0
    let running = false
    const renderOnce = () => {
      controls.update()
      renderer.render(scene, camera)
    }
    const loop = () => {
      if (!activeRef.current) {
        running = false // paused: stop ticking entirely
        return
      }
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    const start = () => {
      if (!running && activeRef.current) {
        running = true
        raf = requestAnimationFrame(loop)
      }
    }
    resumeRef.current = start

    const ro = new ResizeObserver(() => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderOnce() // keep the last frame correct even while paused
    })
    ro.observe(host)
    start()

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      geo.dispose()
      mat.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      matRef.current = null
    }
  }, [])

  useEffect(() => {
    matRef.current?.color.set(color)
  }, [color])

  // resume/suspend the loop as visibility changes
  useEffect(() => {
    activeRef.current = active
    if (active) resumeRef.current()
  }, [active])

  return (
    <div
      ref={hostRef}
      className="nodrag nowheel h-full w-full overflow-hidden [&>canvas]:block"
    />
  )
}
