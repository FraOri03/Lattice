import { usePhotoStore } from '@/store/photoStore'
import type {
  PhotoCameraElement,
  PhotoElement,
  PhotoLightElement,
  PhotoPersonElement,
} from '@/types/photo'
import { IcCopy, IcCursor, IcTrash } from '@/components/Icons'

const FIELD =
  'w-full rounded-md border border-bord bg-panel2 px-2 py-1 text-xs text-ink outline-none placeholder:text-muted focus:border-accent'
const LABEL = 'mb-1 block text-[10px] font-medium text-muted'
const SECTION = 'mb-2 border-b border-bord pb-1 text-[10px] font-semibold tracking-widest text-muted uppercase'

function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step = 1,
  accent,
  onChange,
}: {
  label: string
  value: number
  display: string
  min: number
  max: number
  step?: number
  accent?: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-[10px] font-medium text-muted">{label}</label>
        <span className="font-mono text-[11px] font-semibold" style={{ color: accent }}>
          {display}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer"
        style={{ accentColor: accent ?? 'var(--accent)' }}
      />
    </div>
  )
}

function Toggle({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <div className="flex items-center justify-between text-xs text-ink">
      <span>{label}</span>
      <button
        onClick={onClick}
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`relative h-4 w-8 cursor-pointer rounded-full transition-colors ${on ? 'bg-accent' : 'bg-bord'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-3 w-3 rounded-full bg-white transition-transform ${on ? 'translate-x-4' : ''}`}
        />
      </button>
    </div>
  )
}

/** Right panel of Photo mode: parameters of the selected element. */
export function PhotoInspector() {
  const shots = usePhotoStore((s) => s.shots)
  const activeShotId = usePhotoStore((s) => s.activeShotId)
  const selectedElementId = usePhotoStore((s) => s.selectedElementId)
  const gridVisible = usePhotoStore((s) => s.gridVisible)
  const gridSnap = usePhotoStore((s) => s.gridSnap)
  const rulersVisible = usePhotoStore((s) => s.rulersVisible)
  const updateElement = usePhotoStore((s) => s.updateElement)
  const deleteElement = usePhotoStore((s) => s.deleteElement)
  const duplicateElement = usePhotoStore((s) => s.duplicateElement)
  const toggleGrid = usePhotoStore((s) => s.toggleGrid)
  const toggleSnap = usePhotoStore((s) => s.toggleSnap)
  const toggleRulers = usePhotoStore((s) => s.toggleRulers)

  const currentShot = shots.find((s) => s.id === activeShotId) ?? shots[0]
  const selectedElement = currentShot?.elements.find((el) => el.id === selectedElementId)

  const change = (key: string, val: unknown) => {
    if (!selectedElement) return
    updateElement(selectedElement.id, { [key]: val } as Partial<PhotoElement>)
  }

  return (
    <aside className="flex h-full w-72 flex-none flex-col border-l border-bord bg-panel">
      <div className="flex h-9 flex-none items-center gap-2 border-b border-bord px-3 text-[11px] font-semibold tracking-widest text-muted uppercase">
        Inspector
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedElement ? (
          <div className="space-y-4 p-3">
            {/* identity + quick actions */}
            <div className="space-y-2.5 rounded-lg border border-bord bg-panel2/40 p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-accent uppercase">
                    {selectedElement.type}
                  </span>
                  <input
                    type="text"
                    value={selectedElement.name}
                    onChange={(e) => change('name', e.target.value)}
                    className="mt-1.5 block w-full border-b border-transparent bg-transparent text-[13px] font-semibold text-ink outline-none hover:border-bord focus:border-accent"
                    aria-label="Element name"
                  />
                </div>
                <div className="flex flex-none items-center gap-1">
                  <button
                    onClick={() => duplicateElement(selectedElement.id)}
                    className="icon-btn"
                    title="Duplicate element"
                  >
                    <IcCopy size={13} />
                  </button>
                  <button
                    onClick={() => deleteElement(selectedElement.id)}
                    className="icon-btn hover:!text-[#f24822]"
                    title="Delete element"
                  >
                    <IcTrash size={13} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={LABEL}>X (cm)</label>
                  <input
                    type="number"
                    value={Math.round(selectedElement.x)}
                    onChange={(e) => change('x', Number(e.target.value))}
                    className={`${FIELD} font-mono`}
                  />
                </div>
                <div>
                  <label className={LABEL}>Y (cm)</label>
                  <input
                    type="number"
                    value={Math.round(selectedElement.y)}
                    onChange={(e) => change('y', Number(e.target.value))}
                    className={`${FIELD} font-mono`}
                  />
                </div>
                <div>
                  <label className={LABEL}>Rot. (°)</label>
                  <input
                    type="number"
                    value={selectedElement.rotation}
                    onChange={(e) => change('rotation', Number(e.target.value))}
                    className={`${FIELD} font-mono`}
                  />
                </div>
              </div>
            </div>

            {/* camera */}
            {selectedElement.type === 'camera' &&
              (() => {
                const cam = selectedElement as PhotoCameraElement
                return (
                  <div className="space-y-4">
                    <div>
                      <h3 className={SECTION}>Preset & sensor</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={LABEL}>Camera letter</label>
                          <input
                            type="text"
                            value={cam.cameraNumber || 'A'}
                            maxLength={3}
                            onChange={(e) => change('cameraNumber', e.target.value.toUpperCase())}
                            className={`${FIELD} font-mono`}
                          />
                        </div>
                        <div>
                          <label className={LABEL}>Sensor</label>
                          <select
                            value={cam.sensor}
                            onChange={(e) => change('sensor', e.target.value)}
                            className={FIELD}
                          >
                            <option value="Full Frame">Full Frame (35mm)</option>
                            <option value="APS-C">APS-C</option>
                            <option value="Super 35">Super 35</option>
                            <option value="Medium Format">Medium Format</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <SliderRow
                        label="Focal length"
                        value={cam.focalLength}
                        display={`${cam.focalLength}mm`}
                        min={12}
                        max={200}
                        accent="#10b981"
                        onChange={(v) => change('focalLength', v)}
                      />
                      <div className="flex items-center justify-between rounded-md border border-[#10b981]/30 bg-[#10b981]/10 px-2.5 py-1.5 text-xs">
                        <span className="text-muted">Computed FOV</span>
                        <span className="font-mono font-bold text-[#10b981]">{cam.fov}°</span>
                      </div>

                      <div>
                        <label className={LABEL}>Shot type</label>
                        <select
                          value={cam.shotType}
                          onChange={(e) => change('shotType', e.target.value)}
                          className={FIELD}
                        >
                          <option value="Extreme Wide">Extreme wide shot</option>
                          <option value="Wide">Wide shot</option>
                          <option value="Medium">Medium shot</option>
                          <option value="Close Up">Close up</option>
                          <option value="Detail">Detail</option>
                        </select>
                      </div>

                      <SliderRow
                        label="Subject distance"
                        value={cam.targetDistance}
                        display={`${cam.targetDistance} cm`}
                        min={50}
                        max={800}
                        onChange={(v) => change('targetDistance', v)}
                      />
                    </div>

                    <div>
                      <h3 className={SECTION}>Exposure</h3>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className={LABEL}>Aperture</label>
                          <select
                            value={cam.aperture}
                            onChange={(e) => change('aperture', e.target.value)}
                            className={FIELD}
                          >
                            {['f/1.2', 'f/1.4', 'f/1.8', 'f/2.0', 'f/2.8', 'f/4.0', 'f/5.6', 'f/8.0'].map(
                              (f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ),
                            )}
                          </select>
                        </div>
                        <div>
                          <label className={LABEL}>ISO</label>
                          <select
                            value={cam.iso}
                            onChange={(e) => change('iso', Number(e.target.value))}
                            className={FIELD}
                          >
                            {[100, 200, 400, 800, 1600, 3200].map((iso) => (
                              <option key={iso} value={iso}>
                                {iso}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={LABEL}>Shutter</label>
                          <select
                            value={cam.shutter}
                            onChange={(e) => change('shutter', e.target.value)}
                            className={FIELD}
                          >
                            {['1/25s', '1/50s', '1/100s', '1/200s'].map((sh) => (
                              <option key={sh} value={sh}>
                                {sh}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className={SECTION}>3D placement</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={LABEL}>Height (cm)</label>
                          <input
                            type="number"
                            value={cam.cameraHeight || 150}
                            onChange={(e) => change('cameraHeight', Number(e.target.value))}
                            className={`${FIELD} font-mono`}
                          />
                        </div>
                        <div>
                          <label className={LABEL}>Tilt (°)</label>
                          <input
                            type="number"
                            value={cam.tilt || 0}
                            onChange={(e) => change('tilt', Number(e.target.value))}
                            className={`${FIELD} font-mono`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}

            {/* light */}
            {selectedElement.type === 'light' &&
              (() => {
                const light = selectedElement as PhotoLightElement
                return (
                  <div className="space-y-4">
                    <div>
                      <h3 className={SECTION}>Fixture</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={LABEL}>Light type</label>
                          <select
                            value={light.lightType}
                            onChange={(e) => change('lightType', e.target.value)}
                            className={FIELD}
                          >
                            <option value="softbox">Softbox</option>
                            <option value="stripbox">Stripbox</option>
                            <option value="fresnel">Fresnel</option>
                            <option value="led_panel">LED panel</option>
                            <option value="tube_light">Tube light</option>
                            <option value="spot">Spot</option>
                            <option value="beauty_dish">Beauty dish</option>
                            <option value="bounce">Bounce board</option>
                            <option value="sun">Sun</option>
                          </select>
                        </div>
                        <div>
                          <label className={LABEL}>Stand height (cm)</label>
                          <input
                            type="number"
                            value={light.lightHeight || 180}
                            onChange={(e) => change('lightHeight', Number(e.target.value))}
                            className={`${FIELD} font-mono`}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <SliderRow
                        label="Intensity"
                        value={light.intensity}
                        display={`${light.intensity}%`}
                        min={10}
                        max={100}
                        accent="#f59e0b"
                        onChange={(v) => change('intensity', v)}
                      />
                      <SliderRow
                        label="Color temperature"
                        value={light.colorTemperature}
                        display={`${light.colorTemperature}K`}
                        min={2000}
                        max={9000}
                        step={100}
                        accent="#fb923c"
                        onChange={(v) => change('colorTemperature', v)}
                      />
                      <SliderRow
                        label="Beam angle"
                        value={light.beamAngle}
                        display={`${light.beamAngle}°`}
                        min={15}
                        max={180}
                        accent="#f59e0b"
                        onChange={(v) => change('beamAngle', v)}
                      />
                      <SliderRow
                        label="Falloff"
                        value={light.falloff || 300}
                        display={`${light.falloff || 300} cm`}
                        min={50}
                        max={1000}
                        onChange={(v) => change('falloff', v)}
                      />
                    </div>

                    <div>
                      <h3 className={SECTION}>Gel & DMX</h3>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className={LABEL}>Gel (name)</label>
                          <input
                            type="text"
                            placeholder="CTO, CTB, Magenta…"
                            value={light.gelName || ''}
                            onChange={(e) => change('gelName', e.target.value)}
                            className={FIELD}
                          />
                        </div>
                        <div>
                          <label className={LABEL}>DMX channel</label>
                          <input
                            type="number"
                            min={1}
                            max={512}
                            value={light.dmxChannel || 1}
                            onChange={(e) => change('dmxChannel', Number(e.target.value))}
                            className={`${FIELD} font-mono`}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })()}

            {/* person */}
            {selectedElement.type === 'person' &&
              (() => {
                const pers = selectedElement as PhotoPersonElement
                return (
                  <div className="space-y-3">
                    <h3 className={SECTION}>Subject profile</h3>
                    <div>
                      <label className={LABEL}>Role on set</label>
                      <select
                        value={pers.role}
                        onChange={(e) => change('role', e.target.value)}
                        className={FIELD}
                      >
                        <option value="Actor">Lead actor</option>
                        <option value="Model">Model / subject</option>
                        <option value="Extra">Extra</option>
                        <option value="Photographer">Photographer</option>
                        <option value="Crew">Operator / director</option>
                        <option value="Assistant">Assistant</option>
                      </select>
                    </div>

                    <SliderRow
                      label="Gaze direction"
                      value={pers.lookAngle}
                      display={`${pers.lookAngle}°`}
                      min={0}
                      max={360}
                      accent="#ec4899"
                      onChange={(v) => change('lookAngle', v)}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className={LABEL}>Pose</label>
                        <select
                          value={pers.pose}
                          onChange={(e) => change('pose', e.target.value)}
                          className={FIELD}
                        >
                          <option value="standing">Standing</option>
                          <option value="sitting">Sitting</option>
                          <option value="kneeling">Kneeling</option>
                          <option value="action">In motion</option>
                        </select>
                      </div>
                      <div>
                        <label className={LABEL}>Height (cm)</label>
                        <input
                          type="number"
                          value={pers.personHeight}
                          onChange={(e) => change('personHeight', Number(e.target.value))}
                          className={`${FIELD} font-mono`}
                        />
                      </div>
                    </div>
                  </div>
                )
              })()}

            {/* prop-like */}
            {(selectedElement.type === 'prop' ||
              selectedElement.type === 'environment' ||
              selectedElement.type === 'nature' ||
              selectedElement.type === 'vehicle' ||
              selectedElement.type === 'furniture') && (
              <div className="space-y-3">
                <h3 className={SECTION}>Real dimensions</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={LABEL}>Width (cm)</label>
                    <input
                      type="number"
                      value={selectedElement.width || 100}
                      onChange={(e) => change('width', Math.max(1, Number(e.target.value)))}
                      className={`${FIELD} font-mono`}
                    />
                  </div>
                  <div>
                    <label className={LABEL}>Depth (cm)</label>
                    <input
                      type="number"
                      value={selectedElement.height || 100}
                      onChange={(e) => change('height', Math.max(1, Number(e.target.value)))}
                      className={`${FIELD} font-mono`}
                    />
                  </div>
                </div>

                <div>
                  <label className={LABEL}>Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={selectedElement.color || '#64748b'}
                      onChange={(e) => change('color', e.target.value)}
                      className="h-7 w-8 cursor-pointer rounded border border-bord bg-transparent"
                      aria-label="Element color"
                    />
                    <input
                      type="text"
                      value={selectedElement.color || '#64748b'}
                      onChange={(e) => change('color', e.target.value)}
                      className={`${FIELD} font-mono`}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* general */}
            <div className="space-y-3">
              <h3 className={SECTION}>General</h3>
              <SliderRow
                label="Opacity"
                value={selectedElement.opacity}
                display={`${Math.round(selectedElement.opacity * 100)}%`}
                min={0.1}
                max={1}
                step={0.05}
                onChange={(v) => change('opacity', v)}
              />
              <div>
                <label className={LABEL}>Z-index (stacking)</label>
                <input
                  type="number"
                  value={selectedElement.zIndex}
                  onChange={(e) => change('zIndex', Number(e.target.value))}
                  className={`${FIELD} font-mono`}
                />
              </div>
              <div>
                <label className={LABEL}>Alternative label</label>
                <input
                  type="text"
                  placeholder={selectedElement.name}
                  value={selectedElement.label || ''}
                  onChange={(e) => change('label', e.target.value)}
                  className={FIELD}
                />
              </div>
              <div>
                <label className={LABEL}>Technical notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. boom stand, wall socket…"
                  value={selectedElement.notes || ''}
                  onChange={(e) => change('notes', e.target.value)}
                  className={`${FIELD} resize-none`}
                />
              </div>
            </div>
          </div>
        ) : (
          /* empty state: canvas preferences + shortcuts */
          <div className="space-y-4 p-3">
            <div className="flex flex-col items-center rounded-lg border border-bord bg-panel2/40 p-4 text-center">
              <IcCursor size={18} className="mb-2 text-muted" />
              <p className="text-xs font-semibold">No element selected</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                Click an element on the canvas or in the layer list to tune its technical
                parameters.
              </p>
            </div>

            <div className="space-y-2.5 rounded-lg border border-bord p-2.5">
              <h3 className={SECTION}>Canvas preferences</h3>
              <Toggle on={gridVisible} onClick={toggleGrid} label="Show grid" />
              <Toggle on={gridSnap} onClick={toggleSnap} label="Snap to grid (10 cm)" />
              <Toggle on={rulersVisible} onClick={toggleRulers} label="Show rulers" />
            </div>

            <div className="space-y-2">
              <h3 className={SECTION}>Shortcuts</h3>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-muted">
                {(
                  [
                    ['Space + drag', 'Pan canvas'],
                    ['Scroll', 'Zoom in / out'],
                    ['Shift + drag', 'Coarse 50 cm snap'],
                    ['Shift + rotate', 'Snap to 15°'],
                    ['V / H', 'Select / pan tool'],
                    ['Del', 'Delete element'],
                  ] as const
                ).map(([keys, what]) => (
                  <div key={keys} className="flex flex-col gap-0.5">
                    <kbd className="w-fit rounded border border-bord bg-panel2 px-1 py-0.5 text-[9.5px] text-ink">
                      {keys}
                    </kbd>
                    <span>{what}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}
