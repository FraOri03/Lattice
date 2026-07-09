import { useState } from 'react'
import type { NodeProps } from '@xyflow/react'
import type { BoardNode } from '@/types/model'
import { useStore } from '@/store/useStore'
import { sanitizeEmbedUrl, faviconUrlFor } from '@/lib/web/WebEmbedService'
import { hostnameOf } from '@/lib/media'
import { toast } from '@/components/ui/Toaster'
import { promptDialog } from '@/components/ui/ConfirmDialog'
import { CardChrome } from './CardChrome'
import {
  IcAlert,
  IcExternal,
  IcEye,
  IcGlobe,
  IcMaximize,
} from '@/components/Icons'

/**
 * WebEmbedCard — a webpage on the board. Renders the site in a sandboxed
 * iframe; falls back to a link preview when the user switches mode or the
 * site refuses to be framed (X-Frame-Options — undetectable from JS, so
 * the card offers the switch explicitly). URLs are sanitized before ever
 * reaching the iframe; blocked schemes render a warning instead.
 */
export function WebEmbedCardNode({ id, data, selected }: NodeProps<BoardNode>) {
  const embed = data.embed
  const updateWebEmbed = useStore((s) => s.updateWebEmbed)
  const resizeCard = useStore((s) => s.resizeCard)
  const [faviconBroken, setFaviconBroken] = useState(false)

  const changeUrl = async () => {
    const raw = await promptDialog({
      title: 'Change webpage URL',
      label: 'URL',
      initialValue: embed?.url ?? 'https://',
      confirmLabel: 'Update',
    })
    if (!raw) return
    const res = sanitizeEmbedUrl(raw)
    if (!res.ok) {
      toast.error('Invalid URL', res.reason)
      return
    }
    updateWebEmbed(id, {
      url: res.url,
      title: hostnameOf(res.url),
      faviconUrl: faviconUrlFor(res.url),
      embedAllowed: true,
      fallbackMode: 'iframe',
    })
    setFaviconBroken(false)
  }

  const actions = embed && (
    <>
      <button
        className="icon-btn h-5 w-5"
        title={
          embed.fallbackMode === 'iframe'
            ? 'Switch to link preview'
            : 'Try live embed'
        }
        onClick={() =>
          updateWebEmbed(id, {
            fallbackMode: embed.fallbackMode === 'iframe' ? 'preview' : 'iframe',
          })
        }
      >
        {embed.fallbackMode === 'iframe' ? <IcEye size={11} /> : <IcGlobe size={11} />}
      </button>
      <button
        className="icon-btn h-5 w-5"
        title="Resize to full page"
        onClick={() => resizeCard(id, 1100, 800)}
      >
        <IcMaximize size={11} />
      </button>
      <a
        className="icon-btn h-5 w-5"
        href={embed.url}
        target="_blank"
        rel="noreferrer noopener"
        title="Open in a new tab"
      >
        <IcExternal size={11} />
      </a>
    </>
  )

  return (
    <CardChrome
      data={data}
      selected={selected}
      icon={
        embed?.faviconUrl && !faviconBroken ? (
          <img
            src={embed.faviconUrl}
            alt=""
            width={13}
            height={13}
            className="rounded-sm"
            onError={() => setFaviconBroken(true)}
          />
        ) : (
          <IcGlobe size={13} />
        )
      }
      title={embed?.title || 'Web embed'}
      minWidth={240}
      minHeight={140}
      actions={actions}
    >
      {!embed ? (
        <div className="placeholder">
          <IcGlobe size={22} />
          No URL yet
          <button className="btn nodrag" onClick={changeUrl}>
            Set URL…
          </button>
        </div>
      ) : !embed.embedAllowed ? (
        <div className="placeholder">
          <IcAlert size={22} className="text-[#ffa629]" />
          <span className="font-medium text-ink">Embed blocked</span>
          <span>This URL uses an unsafe scheme and will not be rendered.</span>
          <button className="btn nodrag" onClick={changeUrl}>
            Change URL…
          </button>
        </div>
      ) : embed.fallbackMode === 'iframe' ? (
        <div className="flex h-full flex-col">
          {/*
           * sandbox (required): no top-navigation, no downloads, no modals.
           * allow-same-origin + allow-scripts lets normal sites work while
           * the frame still can't touch the Lattice origin (cross-origin).
           */}
          <iframe
            src={embed.url}
            title={embed.title}
            className="nodrag nowheel min-h-0 w-full flex-1 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
          <div className="flex flex-none items-center gap-1 border-t border-bord px-2 py-1 text-[10px] text-muted">
            <IcGlobe size={10} />
            <span className="min-w-0 flex-1 truncate">{hostnameOf(embed.url)}</span>
            <button
              className="nodrag cursor-pointer text-accent hover:underline"
              onClick={() => updateWebEmbed(id, { fallbackMode: 'preview' })}
              title="Sites that send X-Frame-Options render blank — switch to a link preview"
            >
              Blank? Use preview
            </button>
          </div>
        </div>
      ) : (
        <a
          href={embed.url}
          target="_blank"
          rel="noreferrer noopener"
          className="nodrag flex h-full flex-col items-center justify-center gap-2 px-4 text-center hover:bg-panel2"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-bord bg-panel2">
            {embed.faviconUrl && !faviconBroken ? (
              <img
                src={embed.faviconUrl}
                alt=""
                width={24}
                height={24}
                onError={() => setFaviconBroken(true)}
              />
            ) : (
              <IcGlobe size={22} className="text-muted" />
            )}
          </span>
          <span className="max-w-full truncate text-[13px] font-semibold">
            {embed.title}
          </span>
          <span className="max-w-full truncate text-[11px] text-muted">{embed.url}</span>
          <span className="mt-1 flex items-center gap-1 text-[11px] text-accent">
            <IcExternal size={11} /> Open website
          </span>
        </a>
      )}
    </CardChrome>
  )
}
