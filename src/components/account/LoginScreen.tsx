import { useAccount } from '@/lib/auth/AccountProvider'
import { env } from '@/lib/env'
import { IcAlert, IcCloud, IcDrive, IcGithub, IcShield } from '@/components/Icons'

/**
 * First-run login gate. Google OAuth is the primary method; "Continue
 * without an account" keeps everything local (no cloud features). With no
 * OAuth credentials configured, the button creates an honest local mock
 * account — clearly labeled, no fake cloud sync.
 */
export function LoginScreen() {
  const { signIn, skipLogin, status, authKind, error } = useAccount()

  return (
    <div className="flex h-full items-center justify-center bg-bg">
      <div className="w-[420px] rounded-2xl border border-bord bg-panel p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3">
          <span className="h-10 w-10 flex-none rounded-xl bg-gradient-to-br from-[#0d99ff] to-[#9747ff]" />
          <div>
            <h1 className="text-lg font-bold tracking-tight">Lattice</h1>
            <p className="text-[11px] text-muted">
              Your unified creative workspace · v{env.appVersion}
            </p>
          </div>
        </div>

        <p className="mb-5 text-[13px] leading-relaxed text-muted">
          Sign in to unlock your personal vault: projects, cloud saves and
          Google Drive-backed storage. Your work stays local-first — the
          cloud is a synced backup, not a requirement.
        </p>

        <button
          className="btn w-full justify-center gap-2 py-2.5 text-[13px]"
          disabled={status === 'signing-in'}
          onClick={() => void signIn()}
        >
          {authKind === 'google' ? (
            <>
              <GoogleGlyph />
              {status === 'signing-in' ? 'Signing in…' : 'Continue with Google'}
            </>
          ) : (
            <>
              <IcShield size={14} />
              {status === 'signing-in' ? 'Creating…' : 'Create local account (demo)'}
            </>
          )}
        </button>

        {authKind === 'mock' && (
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted">
            <IcAlert size={12} className="mt-0.5 flex-none text-[#ffa629]" />
            Google OAuth is not configured (VITE_GOOGLE_CLIENT_ID is empty),
            so this creates a local-only account. Cloud sync stays off — no
            pretend syncing.
          </p>
        )}

        {error && (
          <p className="mt-2 text-[11px] text-[#f24822]">{error}</p>
        )}

        <button
          className="mt-3 w-full cursor-pointer rounded-md px-2 py-2 text-center text-xs text-muted hover:text-ink"
          onClick={skipLogin}
        >
          Continue without an account →
        </button>

        <div className="mt-6 border-t border-bord pt-4">
          <p className="mb-2 text-[10px] font-semibold tracking-widest text-muted uppercase">
            An account unlocks
          </p>
          <ul className="space-y-1.5 text-[12px] text-muted">
            <li className="flex items-center gap-2">
              <IcCloud size={13} className="text-accent" /> Cloud saves — offline-first, synced when online
            </li>
            <li className="flex items-center gap-2">
              <IcDrive size={13} className="text-accent" /> Google Drive storage for your vault & projects
            </li>
            <li className="flex items-center gap-2">
              <IcGithub size={13} className="text-accent" /> GitHub sync for code documents
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function GoogleGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.5-5.5C29.4 34.7 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 39.6 16.3 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4 5.6l6.5 5.5C41.4 35.4 44 30.1 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  )
}
