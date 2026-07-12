import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import type { AssetDoc } from '@/types/model'
import { getAssetUrl } from '@/lib/assets/AssetRegistry'
import { lookupDependency, normalizeRelPath } from '@/lib/assets/AssetBundle'
import { useStore } from '@/store/useStore'
import { importFiles } from '@/lib/import/ImportService'

/**
 * Loads and displays a GLB/GLTF/OBJ(+MTL)/STL model with orbit controls.
 *
 * Multi-file assets (Phase 8): when the asset carries a bundle map,
 * every relative reference (buffers, textures, materials) resolves
 * through it via a three.js LoadingManager URL modifier. Anything the
 * model requests that the bundle can't satisfy is COLLECTED and shown —
 * with a "Relink missing files" picker — instead of a silently empty
 * viewport.
 */
export function ThreeDViewer({
  url,
  ext,
  asset,
  active = true,
}: {
  url?: string
  ext: string
  asset?: AssetDoc
  /** false = off-screen / page hidden: render on-demand only, no idle loop */
  active?: boolean
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [missing, setMissing] = useState<string[]>([])
  const [reloadSeq, setReloadSeq] = useState(0)
  const relinkInput = useRef<HTMLInputElement>(null)
  const patchAsset = useStore((s) => s.patchAsset)
  const activeRef = useRef(active)
  const requestRenderRef = useRef<() => void>(() => {})
  // live bundle (relink updates it without unmounting)
  const liveBundle = useStore((s) =>
    asset ? s.assets[asset.id]?.bundle : undefined,
  )

  useEffect(() => {
    if (!url) return
    setStatus('loading')
    setMissing([])
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
      requestRenderRef.current() // draw the first frame (on-demand)
    }

    const missingPaths = new Set<string>()
    const reportMissing = () => {
      if (!disposed && missingPaths.size) setMissing([...missingPaths].sort())
    }
    const onError = () => {
      if (!disposed) {
        setStatus('error')
        reportMissing()
      }
    }

    let cancelled = false
    const load = async () => {
      // pre-resolve every bundle dependency to a blob: URL — the
      // LoadingManager URL modifier is synchronous
      const resolved = new Map<string, string>()
      const bundle = liveBundle
      if (bundle) {
        for (const [path, id] of Object.entries(bundle.dependencies)) {
          const depUrl = await getAssetUrl(id)
          if (depUrl) resolved.set(path, depUrl)
        }
      }
      if (cancelled || disposed) return

      const manager = new THREE.LoadingManager()
      manager.setURLModifier((requested) => {
        if (requested === url || requested.startsWith('blob:') || requested.startsWith('data:'))
          return requested
        const norm = normalizeRelPath(requested.replace(/^blob:[^/]*\//, ''))
        const hit =
          resolved.get(norm) ??
          resolved.get(norm.split('/').pop() ?? norm) ??
          (bundle ? undefined : undefined)
        if (hit) return hit
        // basename fallback across all resolved deps
        const base = norm.split('/').pop() ?? norm
        for (const [p, u] of resolved) {
          if ((p.split('/').pop() ?? p) === base) return u
        }
        missingPaths.add(norm)
        return requested
      })
      manager.onLoad = reportMissing
      manager.onError = () => reportMissing()

      if (ext === 'obj') {
        const finishObj = (obj: THREE.Object3D, hasMaterials: boolean) => {
          if (!hasMaterials) {
            obj.traverse((child) => {
              if ((child as THREE.Mesh).isMesh) {
                ;(child as THREE.Mesh).material = new THREE.MeshStandardMaterial({
                  color: 0x9aa2ad,
                  metalness: 0.2,
                  roughness: 0.55,
                })
              }
            })
          }
          fitAndAdd(obj)
        }
        const mtlId = bundle ? lookupDependency(bundle, findMtlKey(bundle)) : undefined
        const mtlUrl = mtlId ? await getAssetUrl(mtlId) : undefined
        if (mtlUrl) {
          new MTLLoader(manager).load(
            mtlUrl,
            (materials) => {
              materials.preload()
              new OBJLoader(manager)
                .setMaterials(materials)
                .load(url, (obj) => finishObj(obj, true), undefined, onError)
            },
            undefined,
            // broken MTL: still show the geometry with a neutral material
            () =>
              new OBJLoader(manager).load(
                url,
                (obj) => finishObj(obj, false),
                undefined,
                onError,
              ),
          )
        } else {
          new OBJLoader(manager).load(url, (obj) => finishObj(obj, false), undefined, onError)
        }
      } else if (ext === 'stl') {
        new STLLoader(manager).load(
          url,
          (geometry) => {
            const mesh = new THREE.Mesh(
              geometry,
              new THREE.MeshStandardMaterial({ color: 0x9aa2ad, metalness: 0.25, roughness: 0.5 }),
            )
            fitAndAdd(mesh)
          },
          undefined,
          onError,
        )
      } else {
        new GLTFLoader(manager).load(url, (gltf) => fitAndAdd(gltf.scene), undefined, onError)
      }
    }
    void load()

    // On-demand rendering (PERF-2): no continuous rAF while the model sits
    // still. A frame is scheduled on user interaction (OrbitControls 'change'),
    // while damping settles, on resize, and when the viewer becomes active.
    // Idle model + idle board ⇒ zero frames scheduled.
    let raf = 0
    let running = false
    const tick = () => {
      const changed = controls.update()
      renderer.render(scene, camera)
      if (activeRef.current && changed) {
        raf = requestAnimationFrame(tick)
      } else {
        running = false
      }
    }
    const requestRender = () => {
      if (!running && activeRef.current) {
        running = true
        raf = requestAnimationFrame(tick)
      }
    }
    requestRenderRef.current = requestRender
    controls.addEventListener('change', requestRender)

    const ro = new ResizeObserver(() => {
      const w = host.clientWidth
      const h = host.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      requestRender()
    })
    ro.observe(host)
    requestRender()

    return () => {
      disposed = true
      cancelled = true
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ext, reloadSeq, liveBundle])

  // resume on-demand rendering when the viewer becomes visible again (PERF-2)
  useEffect(() => {
    activeRef.current = active
    if (active) requestRenderRef.current()
  }, [active])

  /** Import picked files as new dependencies and reload the model. */
  const relink = async (files: FileList | null) => {
    if (!asset || !files?.length) return
    const { depKeyFor } = await import('@/lib/assets/AssetBundle')
    const outcomes = await importFiles(Array.from(files))
    const additions: Record<string, string> = {}
    let i = 0
    for (const f of Array.from(files)) {
      const outcome = outcomes[i++]
      if (outcome?.kind === 'asset') additions[depKeyFor(f)] = outcome.asset.id
    }
    patchAsset(asset.id, {
      bundle: {
        dependencies: { ...(liveBundle?.dependencies ?? {}), ...additions },
      },
    })
    setReloadSeq((n) => n + 1)
  }

  const showDiagnostics = missing.length > 0 && (ext === 'gltf' || ext === 'obj')

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="nodrag nowheel h-full w-full overflow-hidden [&>canvas]:block" />
      {status !== 'ready' && !showDiagnostics && (
        <div className="placeholder absolute inset-0">
          {status === 'loading' ? 'Loading model…' : 'Could not load this model.'}
        </div>
      )}
      {showDiagnostics && (
        <div
          className="absolute inset-x-2 bottom-2 rounded-lg border border-[#ffa629]/50 bg-panel/95 p-2 text-[11px] shadow-lg"
          role="alert"
        >
          <p className="mb-1 font-semibold">
            {status === 'error' ? 'Model could not load — ' : ''}missing companion file
            {missing.length > 1 ? 's' : ''}:
          </p>
          <p className="mb-1.5 font-mono text-[10px] break-all text-muted">
            {missing.slice(0, 4).join(' · ')}
            {missing.length > 4 ? ` +${missing.length - 4} more` : ''}
          </p>
          {asset && (
            <button className="btn" onClick={() => relinkInput.current?.click()}>
              Relink missing files…
            </button>
          )}
          <input
            ref={relinkInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              void relink(e.target.files)
              e.target.value = ''
            }}
          />
        </div>
      )}
      {status === 'ready' && !showDiagnostics && (
        <span className="pointer-events-none absolute right-2 bottom-1.5 text-[10px] text-muted">
          drag to orbit · scroll to zoom
        </span>
      )}
    </div>
  )
}

/** First .mtl key inside a bundle map ('' when none). */
function findMtlKey(bundle: { dependencies: Record<string, string> }): string {
  return Object.keys(bundle.dependencies).find((k) => k.endsWith('.mtl')) ?? ''
}
