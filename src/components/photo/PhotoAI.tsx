import { useState } from 'react'
import { usePhotoStore } from '@/store/photoStore'
import { generateSetLayout, getPhotoAiKey, setPhotoAiKey } from '@/lib/photo/ai'
import { IcAlert, IcCheckCircle, IcSend, IcSparkles, IcX } from '@/components/Icons'

const FIELD =
  'w-full rounded-md border border-bord bg-panel2 px-2 py-1 text-xs text-ink outline-none placeholder:text-muted focus:border-accent'

const SUGGESTIONS = [
  {
    title: 'Beauty photo set',
    prompt: 'Create a beauty photoshoot set with two softboxes and a rim light.',
  },
  {
    title: 'Ski slope with drone',
    prompt:
      'Create a scene on a summer ski slope with a photographer at the edge of the track and two cameras, one on a drone.',
  },
  {
    title: 'Cinematic interview',
    prompt:
      'Set up a video interview with a 45-degree key light, an LED fill panel and a camera with an 85mm lens for cinematic bokeh.',
  },
  {
    title: 'Night exterior',
    prompt:
      'Create a night exterior set with two actors close together, a warm yellow spot simulating a street lamp and a cold blue rim light.',
  },
]

const LOADING_STEPS = [
  'Contacting the virtual director…',
  'Setting up the coordinate plane…',
  'Computing camera FOV cones…',
  'Balancing light temperatures…',
  'Placing subjects and backdrop…',
  'Drawing the blueprint on canvas…',
]

/** Right-side AI panel: prompt → generated set layout for the active shot. */
export function PhotoAI() {
  const loadRawElements = usePhotoStore((s) => s.loadRawElements)
  const setAiPanelOpen = usePhotoStore((s) => s.setAiPanelOpen)

  const [prompt, setPrompt] = useState('')
  const [apiKey, setApiKey] = useState(getPhotoAiKey())
  const [isLoading, setIsLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [lastPrompt, setLastPrompt] = useState('')

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  const handleGenerate = async (selectedPrompt: string, forceOffline = false) => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)
    setLastPrompt(selectedPrompt)

    try {
      const stepPromise = (async () => {
        for (const step of LOADING_STEPS) {
          setLoadingStep(step)
          await sleep(450)
        }
      })()
      const [, result] = await Promise.all([
        stepPromise,
        generateSetLayout(selectedPrompt, { forceOffline }),
      ])

      loadRawElements(result.elements)
      const cameras = result.elements.filter((e) => e.type === 'camera').length
      const lights = result.elements.filter((e) => e.type === 'light').length
      const others = result.elements.length - cameras - lights
      setSuccess(
        `${result.source === 'gemini' ? 'Gemini' : 'Offline template'} placed ${cameras} camera${cameras === 1 ? '' : 's'}, ${lights} light${lights === 1 ? '' : 's'} and ${others} scene element${others === 1 ? '' : 's'} in the active shot.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error — check the API key.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (prompt.trim()) void handleGenerate(prompt.trim())
  }

  return (
    <aside className="flex h-full w-72 flex-none flex-col border-l border-bord bg-panel">
      <div className="flex h-9 flex-none items-center justify-between border-b border-bord px-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-muted uppercase">
          <IcSparkles size={14} className="text-accent" /> AI set designer
        </div>
        <button
          onClick={() => setAiPanelOpen(false)}
          className="icon-btn"
          title="Close AI panel"
          aria-label="Close AI panel"
        >
          <IcX size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto p-3">
        <p className="text-[11px] leading-relaxed text-muted">
          Describe the scene you want to plan: the assistant lays out cameras, lights and
          subjects on the set, replacing the active shot's elements.
        </p>

        {/* quick examples */}
        <div>
          <span className="mb-1.5 block text-[10px] font-semibold tracking-widest text-muted uppercase">
            Quick examples
          </span>
          <div className="space-y-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s.title}
                onClick={() => {
                  setPrompt(s.prompt)
                  void handleGenerate(s.prompt)
                }}
                disabled={isLoading}
                className="group flex w-full cursor-pointer items-center justify-between rounded-lg border border-bord bg-panel2/50 p-2 text-left text-xs hover:border-accent disabled:opacity-50"
              >
                <span className="truncate pr-2 font-medium group-hover:text-ink">{s.title}</span>
                <IcSparkles size={12} className="flex-none text-accent opacity-40 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>

        {/* prompt */}
        <form onSubmit={handleSubmit} className="border-t border-bord pt-3">
          <div className="relative">
            <textarea
              rows={3}
              placeholder="Describe the set (e.g. interview with 3 lights…)"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isLoading}
              className={`${FIELD} resize-none pr-9`}
            />
            <button
              type="submit"
              disabled={isLoading || !prompt.trim()}
              className="absolute right-2 bottom-2 cursor-pointer rounded-md border border-bord bg-panel2 p-1.5 text-accent hover:border-accent disabled:cursor-default disabled:text-muted disabled:opacity-50"
              title="Generate layout"
              aria-label="Generate layout"
            >
              <IcSend size={13} />
            </button>
          </div>
        </form>

        {/* progress */}
        {isLoading && (
          <div className="space-y-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              <span className="text-[10px] font-bold tracking-wider text-accent uppercase">
                Generating…
              </span>
            </div>
            <p className="text-[11px] text-muted italic">{loadingStep}</p>
          </div>
        )}

        {/* result banners */}
        {success && (
          <div className="space-y-1 rounded-lg border border-[#14ae5c]/40 bg-[#14ae5c]/10 p-2.5 text-xs">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-[#14ae5c] uppercase">
              <IcCheckCircle size={14} /> Set generated
            </div>
            <p className="text-[11px] leading-relaxed text-muted">{success}</p>
          </div>
        )}
        {error && (
          <div className="space-y-1.5 rounded-lg border border-[#f24822]/40 bg-[#f24822]/10 p-2.5 text-xs">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider text-[#f24822] uppercase">
              <IcAlert size={14} /> Generation failed
            </div>
            <p className="text-[11px] leading-relaxed text-muted">{error}</p>
            {lastPrompt && (
              <button
                className="btn w-full !py-1 text-[11px]"
                onClick={() => void handleGenerate(lastPrompt, true)}
              >
                Use the offline generator instead
              </button>
            )}
          </div>
        )}
      </div>

      {/* API key */}
      <div className="flex-none border-t border-bord p-3">
        <label className="mb-1 block text-[10px] font-medium text-muted">
          Gemini API key (optional)
        </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value)
            setPhotoAiKey(e.target.value.trim())
          }}
          placeholder="Leave empty to use offline templates"
          className={`${FIELD} font-mono`}
          autoComplete="off"
        />
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
          Stored only in this browser and sent only to Google's Gemini API. Without a key the
          assistant uses built-in offline templates.
        </p>
      </div>
    </aside>
  )
}
