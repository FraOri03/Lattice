import { useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { useCollabStore } from '@/lib/collab/collabStore'
import { inviteService } from '@/lib/collab/InviteService'
import { useI18n, useTimeAgo } from '@/lib/i18n'
import { collectSentInvites } from '@/lib/dashboard/honestSections'
import { sharedIndex, useSharedIndex } from '@/lib/dashboard/sharedIndex'
import { displayAddress } from '@/lib/auth/addressAlias'
import { ROLE_LABEL } from '@/types/collab'
import { toast } from '@/components/ui/Toaster'
import { SectionStateBlock } from './SectionStateBlock'
import { IcCheck, IcClock, IcCopy, IcX } from '@/components/Icons'

/**
 * Invites (13.3, 13.5 §3) — one tab that works and one that cannot.
 *
 * **Received is still unavailable, but the reason has moved.** It used to be
 * that the recipient's copy existed nowhere at all; from 18.1 the invitation is
 * a server record, and what is missing is the question — "what is waiting for
 * my address" — which is 18.4's index (#91). You still learn of an invitation
 * by opening its `#invite=` link.
 *
 * **Sent is real**, as an aggregation: per-project invitations already ship, and
 * a workspace-wide list is a UI fold over the projects this device holds rather
 * than a server feature.
 *
 * One claim this page still refuses to make: there is no e-mail backend, so no
 * *delivered* and no *failed* (18.2, #89). *Expired* it now can make, because
 * `expiresAt` is real and the shared rules compute it. Delivery is what
 * `inviteService.linkFor()` actually does — copy the link and send it yourself
 * — and the page says so instead of implying a mail was sent.
 */
/**
 * Received — real from 18.4.
 *
 * It listed nothing before, and could not: the recipient's copy of an
 * invitation existed nowhere, on any device. `/api/shared` answers "what is
 * waiting for my address" from the server, for every address this account has
 * verified — so a row here is an invitation, not a guess.
 *
 * Accepting needs no link. 18.3's gate is the address, and it is satisfied by
 * the same verified identities that produced this list; the token proves a
 * mailbox received something, which this reader has already proved otherwise.
 */
function ReceivedTab() {
  const t = useI18n()
  const timeAgo = useTimeAgo()
  const { index, loading, unavailable, loaded } = useSharedIndex()
  const [busy, setBusy] = useState<string | null>(null)

  /**
   * Until an answer arrives, this section cannot be shown — and "not yet
   * asked" reads the same as "cannot be asked". Rendering the empty state
   * early would claim nothing is waiting for you, which is a different thing
   * from not knowing.
   */
  if (!loaded || unavailable) {
    return (
      <SectionStateBlock
        state="unavailable"
        what={t.destinations.title.invites}
        body={loading ? t.honest.invites.loading : t.honest.invites.whyNoInbox}
      />
    )
  }

  const answer = async (inviteId: string, accept: boolean) => {
    setBusy(inviteId)
    const result = accept
      ? await sharedIndex.accept(inviteId)
      : await sharedIndex.decline(inviteId)
    setBusy(null)
    if (!result.ok) toast.error(t.honest.invites.answerFailed, result.error)
    else if (accept) toast.success(t.honest.invites.accepted)
  }

  if (!index.invitations.length) {
    return <p className="mt-4 text-[11.5px] text-muted">{t.honest.invites.receivedEmpty}</p>
  }

  return (
    <>
      <p className="mt-4 rounded-xl border border-bord bg-panel p-3 text-[11.5px] text-muted">
        {t.honest.invites.receivedIntro(index.addresses.join(', '))}
      </p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {index.invitations.map((invite) => (
          <li
            key={invite.id}
            className="flex flex-wrap items-center gap-2 rounded-xl border border-bord bg-panel px-3 py-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-medium">
                {t.honest.invites.invitedBy(invite.invitedByName, ROLE_LABEL[invite.role])}
              </span>
              <span className="block truncate text-[10.5px] text-muted">
                {displayAddress(invite.email)} · {t.honest.invites.expires(timeAgo(invite.expiresAt))}
              </span>
            </span>
            <button
              className="btn btn-primary flex-none"
              disabled={busy === invite.id}
              onClick={() => void answer(invite.id, true)}
            >
              <IcCheck size={11} />
              {t.honest.invites.accept}
            </button>
            <button
              className="btn flex-none"
              disabled={busy === invite.id}
              onClick={() => void answer(invite.id, false)}
            >
              {t.honest.invites.decline}
            </button>
          </li>
        ))}
      </ul>
    </>
  )
}

export function InvitesDestination() {
  const t = useI18n()
  const timeAgo = useTimeAgo()
  const [tab, setTab] = useState<'received' | 'sent'>('sent')
  const [copied, setCopied] = useState<string | null>(null)
  const projects = useStore((s) => s.projects)
  // subscribing to the map is what re-renders this page when one is revoked
  const invites = useCollabStore((s) => s.invites)

  const sent = useMemo(
    () => collectSentInvites(projects, (id) => invites[id] ?? inviteService.invitesOf(id)),
    [projects, invites],
  )

  const STATUS_ICON = {
    pending: IcClock,
    accepted: IcCheck,
    declined: IcX,
    revoked: IcX,
    expired: IcClock,
  } as const

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <h1 className="text-[19px] font-bold tracking-tight">{t.destinations.title.invites}</h1>
      <p className="mt-1 text-[11.5px] text-muted">{t.destinations.description.invites}</p>

      {/* Sent is the default tab: opening on the one that cannot answer would
          make the page look broken rather than partial */}
      <div role="tablist" aria-label={t.destinations.title.invites} className="mt-4 flex gap-1">
        {(['sent', 'received'] as const).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`min-h-8 cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] ${
              tab === key ? 'bg-panel2 font-semibold text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {key === 'sent' ? t.honest.invites.sent : t.honest.invites.received}
          </button>
        ))}
      </div>

      {tab === 'received' ? (
        <ReceivedTab />
      ) : (
        <>
          <p className="mt-4 rounded-xl border border-bord bg-panel p-3 text-[11.5px] text-muted">
            {t.honest.invites.sentIntro} {t.honest.invites.noDeliveryClaim}
          </p>

          {sent.length === 0 ? (
            <p className="mt-4 text-[11.5px] text-muted">{t.honest.invites.sentEmpty}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-1.5">
              {sent.map(({ invite, projectName }) => {
                const Icon = STATUS_ICON[invite.status as keyof typeof STATUS_ICON]
                return (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-bord bg-panel px-3 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium">
                        {t.honest.invites.invitedTo(displayAddress(invite.email), projectName)}
                      </span>
                      <span className="block truncate text-[10.5px] text-muted">
                        {ROLE_LABEL[invite.role]} · {timeAgo(invite.createdAt)}
                      </span>
                    </span>
                    {/* shape plus word, never colour alone (13.5 §2.7) */}
                    <span className="flex flex-none items-center gap-1 rounded-full border border-bord bg-panel2 px-2 py-0.5 text-[10px] text-muted">
                      {Icon && <Icon size={10} aria-hidden />}
                      {t.honest.invites.status[invite.status as keyof typeof t.honest.invites.status]}
                    </span>
                    {/* the link exists only where its token does (18.1): a
                        record this device did not create carries a digest */}
                    {invite.status === 'pending' && inviteService.linkFor(invite) && (
                      <button
                        className="btn flex-none"
                        onClick={() => {
                          const link = inviteService.linkFor(invite)
                          if (!link) return
                          void navigator.clipboard?.writeText(link)
                          setCopied(invite.id)
                        }}
                      >
                        <IcCopy size={11} />
                        {copied === invite.id
                          ? t.honest.invites.copied
                          : t.honest.invites.copyLink}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
