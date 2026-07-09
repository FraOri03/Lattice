import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'

/**
 * Loads and displays a GLB/GLTF/OBJ model with orbit controls.
 * Models are centered and scaled to fit; OBJ files (which carry no
 * materials without an .mtl) get a neutral standard material.
 */
export function ThreeDViewer({ url, ext }: { url?: string; ext: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    if (!url) return
    setStatus('loading')
    const host = hostRef.current!
    let disposed = false

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200)
    camera.position.set(2.4, 1.8, 3.2)

    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const key = new THREE.DirectionalLight(0xffffff, 2)
    key.position.set(4, 6, 4)
    scene.add(key)
    const fill = new THREE.DirectionalLight(0xffffff, 0.6)
    fill.position.set(-4, 2, -3)
    scene.add(fill)

    const grid = new THREE.GridHelper(10, 20, 0x555555, 0x3a3a3a)
    scene.add(grid)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    const fitAndAdd = (obj: THREE.Object3D) => {
      if (disposed) return
      const box = new THREE.Box3().setFromObject(obj)
      if (box.isEmpty()) {
        // parser produced no geometry (corrupt or non-model file)
        setStatus('error')
        return
      }
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z) || 1
      const s = 2.2 / maxDim
      obj.scale.setScalar(s)
      obj.position.copy(center).multiplyScalar(-s)
      grid.position.y = (box.min.y - center.y) * s
      scene.add(obj)
      setStatus('ready')
    }
    const onError = () => {
      if (!disposed) setStatus('error')
    }

    if (ext === 'obj') {
      new OBJLoader().load(
        url,
        (obj) => {
          obj.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              ;(child as THREE.Mesh).material = new THREE.MeshStandardMaterial({
                color: 0x9aa2ad,
                metalness: 0.2,
                roughness: 0.55,
              })
            }
          })
          fitAndAdd(obj)
        },
        undefined,
        onError,
      )
    } else {
      new GLTFLoader().load(url, (gltf) => fitAndAdd(gltf.scene), undefined, onError)
    }

    let raf = 0
    const loop = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    const ro = new ResizeObserver(() => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    })
    ro.observe(host)
    loop()

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      controls.dispose()
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.isMesh) {
          mesh.geometry?.dispose()
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const m of mats) m?.dispose()
        }
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [url, ext])

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="nodrag nowheel h-full w-full overflow-hidden [&>canvas]:block" />
      {status !== 'ready' && (
        <div className="placeholder absolute inset-0">
          {status === 'loading'
            ? 'Loading model…'
            : 'Could not load this model. Single-file GLB works best; .gltf with external buffers is not supported yet.'}
        </div>
      )}
      {status === 'ready' && (
        <span className="pointer-events-none absolute right-2 bottom-1.5 text-[10px] text-muted">
          drag to orbit · scroll to zoom
        </span>
      )}
    </div>
  )
}
