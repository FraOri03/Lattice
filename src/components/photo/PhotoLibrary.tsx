import { useState } from 'react'
import { usePhotoStore } from '@/store/photoStore'
import { PHOTO_CATEGORIES, PHOTO_PRESETS, type PhotoPreset } from '@/lib/photo/library'
import {
  IcBulb,
  IcCamera,
  IcCube,
  IcEye,
  IcEyeOff,
  IcLayers,
  IcLock,
  IcPlus,
  IcTrash,
  IcUnlock,
  IcUsers,
} from '@/components/Icons'

const FIELD =
  'w-full rounded-md border border-bord bg-panel2 px-2 py-1 text-xs text-ink outline-none placeholder:text-muted focus:border-accent'

function CategoryIcon({ cat, size = 15 }: { cat: string; size?: number }) {
  switch (cat) {
    case PHOTO_CATEGORIES.CAMERA:
      return <IcCamera size={size} />
    case PHOTO_CATEGORIES.LIGHT:
      return <IcBulb size={size} />
    case PHOTO_CATEGORIES.PERSON:
      return <IcUsers size={size} />
    default:
      return <IcCube size={size} />
  }
}

/** Left panel of Photo mode: preset library, layer list, custom prop form. */
export function PhotoLibrary() {
  const shots = usePhotoStore((s) => s.shots)
  const activeShotId = usePhotoStore((s) => s.activeShotId)
  const selectedElementId = usePhotoStore((s) => s.selectedElementId)
  const addElement = usePhotoStore((s) => s.addElement)
  const deleteElement = usePhotoStore((s) => s.deleteElement)
  const selectElement = usePhotoStore((s) => s.selectElement)
  const updateElement = usePhotoStore((s) => s.updateElement)

  const currentShot = shots.find((s) => s.id === activeShotId) ?? shots[0]
  const elements = currentShot?.elements ?? []

  const [activeTab, setActiveTab] = useState<'presets' | 'layers' | 'custom'>('presets')
  const [selectedCategory, setSelectedCategory] = useState<string>(PHOTO_CATEGORIES.CAMERA)

  // custom prop creator
  const [customName, setCustomName] = useState('Diffusion panel')
  const [customWidth, setCustomWidth] = useState(150)
  const [customHeight, setCustomHeight] = useState(25)
  const [customColor, setCustomColor] = useState('#ffffff')
  const [customPath, setCustomPath] = useState('backdrop')

  const categoriesList = Object.values(PHOTO_CATEGORIES)

  const handleAddPreset = (preset: PhotoPreset) => {
    addElement(preset.type, 0, 0, {
      name: preset.name,
      color: preset.color,
      width: preset.width,
      height: preset.height,
      customSvgPath: preset.customSvgPath,
      ...preset.props,
    })
  }

  const handleAddCustomProp = () => {
    addElement('prop', 0, 0, {
      name: customName,
      color: customColor,
      width: Number(customWidth),
      height: Number(customHeight),
      customSvgPath: customPath,
      propType: customPath,
    })
  }

  return (
    <aside className="flex h-full w-72 flex-none flex-col border-r border-bord bg-panel">
      {/* tabs */}
      <div className="flex gap-1 border-b border-bord p-1.5">
        {(
          [
            ['presets', 'Library'],
            ['layers', 'Layers'],
            ['custom', 'Custom'],
          ] as const
        ).map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative flex-1 cursor-pointer rounded-md px-2 py-1.5 text-[11px] font-medium ${
              activeTab === tab ? 'bg-panel2 text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
            {tab === 'layers' && elements.length > 0 && (
              <span className="absolute top-1 right-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
            )}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {/* preset library */}
        {activeTab === 'presets' && (
          <div className="flex h-full min-h-0">
            <div className="flex w-11 flex-none flex-col items-center gap-1 border-r border-bord bg-panel2/40 py-2">
              {categoriesList.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`icon-btn ${selectedCategory === cat ? 'bg-panel2 !text-accent' : ''}`}
                  title={cat}
                  aria-label={cat}
                >
                  <CategoryIcon cat={cat} />
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
              <div className="mb-2 border-b border-bord pb-1 text-[10px] font-semibold tracking-widest text-muted uppercase">
                {selectedCategory}
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {PHOTO_PRESETS.filter((item) => item.category === selectedCategory).map(
                  (preset, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleAddPreset(preset)}
                      className="group flex cursor-pointer flex-col items-start rounded-lg border border-bord bg-panel2/50 p-1.5 text-left hover:border-accent"
                      title={`Add ${preset.name} to the set`}
                    >
                      <div className="mb-1.5 flex h-10 w-full items-center justify-center rounded-md border border-bord bg-panel text-muted">
                        {preset.type === 'camera' && (
                          <IcCamera size={17} className="text-[#10b981]" />
                        )}
                        {preset.type === 'light' && (
                          <IcBulb size={17} className="text-[#f59e0b]" />
                        )}
                        {preset.type === 'person' && (
                          <IcUsers size={17} className="text-[#ec4899]" />
                        )}
                        {preset.type !== 'camera' &&
                          preset.type !== 'light' &&
                          preset.type !== 'person' && <IcCube size={17} />}
                      </div>
                      <span className="w-full truncate text-[11px] font-semibold group-hover:text-ink">
                        {preset.name}
                      </span>
                      <span className="text-[9.5px] text-muted">
                        {preset.width}×{preset.height} cm
                      </span>
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
        )}

        {/* layer list */}
        {activeTab === 'layers' && (
          <div className="space-y-2 p-2.5">
            <div className="flex items-center justify-between border-b border-bord pb-1.5">
              <span className="text-[10px] font-semibold tracking-widest text-muted uppercase">
                Layers in scene ({elements.length})
              </span>
            </div>

            {elements.length === 0 ? (
              <div className="flex flex-col items-center rounded-lg border border-dashed border-bord p-5 text-center text-muted">
                <IcLayers size={24} className="mb-2 opacity-50" />
                <p className="text-xs">No elements on the set.</p>
                <button
                  onClick={() => setActiveTab('presets')}
                  className="mt-2 cursor-pointer text-xs font-semibold text-accent hover:underline"
                >
                  Browse the library
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {elements
                  .slice()
                  .sort((a, b) => b.zIndex - a.zIndex)
                  .map((el) => {
                    const isSelected = selectedElementId === el.id
                    return (
                      <div
                        key={el.id}
                        onClick={() => selectElement(el.id)}
                        className={`flex cursor-pointer items-center justify-between rounded-md border p-1.5 ${
                          isSelected
                            ? 'border-accent bg-panel2 text-ink'
                            : 'border-bord bg-panel2/40 text-muted hover:text-ink'
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2 w-2 flex-none rounded-full"
                            style={{ backgroundColor: el.color }}
                          />
                          <span className="truncate text-xs font-medium">{el.name}</span>
                        </div>

                        <div className="flex flex-none items-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              updateElement(el.id, { hidden: !el.hidden })
                            }}
                            className="cursor-pointer rounded p-1 hover:bg-panel hover:text-ink"
                            title={el.hidden ? 'Show' : 'Hide'}
                          >
                            {el.hidden ? <IcEyeOff size={13} /> : <IcEye size={13} />}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              updateElement(el.id, { locked: !el.locked })
                            }}
                            className="cursor-pointer rounded p-1 hover:bg-panel hover:text-ink"
                            title={el.locked ? 'Unlock' : 'Lock'}
                          >
                            {el.locked ? (
                              <IcLock size={13} className="text-[#ffa629]" />
                            ) : (
                              <IcUnlock size={13} />
                            )}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              deleteElement(el.id)
                            }}
                            className="cursor-pointer rounded p-1 hover:bg-panel hover:text-[#f24822]"
                            title="Delete"
                          >
                            <IcTrash size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}

        {/* custom prop creator */}
        {activeTab === 'custom' && (
          <div className="space-y-3 p-3">
            <div>
              <div className="border-b border-bord pb-1 text-[10px] font-semibold tracking-widest text-muted uppercase">
                New custom element
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                Define real-world shapes and sizes to place on the blueprint.
              </p>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted">Name</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                className={FIELD}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] font-medium text-muted">
                  Width (cm)
                </label>
                <input
                  type="number"
                  value={customWidth}
                  onChange={(e) => setCustomWidth(Math.max(1, Number(e.target.value)))}
                  className={FIELD}
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-muted">
                  Depth (cm)
                </label>
                <input
                  type="number"
                  value={customHeight}
                  onChange={(e) => setCustomHeight(Math.max(1, Number(e.target.value)))}
                  className={FIELD}
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted">
                Shape / symbol
              </label>
              <select
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                className={FIELD}
              >
                <option value="box">Standard rectangle</option>
                <option value="wall">Thick wall</option>
                <option value="door">Interior door</option>
                <option value="window">Window</option>
                <option value="cyclorama">Curved cyclorama</option>
                <option value="backdrop">Backdrop</option>
                <option value="car">Car (sedan)</option>
                <option value="table">Table</option>
                <option value="chair">Chair</option>
                <option value="sofa">Sofa</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-medium text-muted">Color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className="h-7 w-8 cursor-pointer rounded border border-bord bg-transparent"
                  aria-label="Element color"
                />
                <input
                  type="text"
                  value={customColor}
                  onChange={(e) => setCustomColor(e.target.value)}
                  className={`${FIELD} font-mono`}
                />
              </div>
            </div>

            <button className="btn w-full" onClick={handleAddCustomProp}>
              <IcPlus size={13} /> Add to set
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
