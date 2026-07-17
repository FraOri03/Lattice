import type { Locale } from '@/types/model'
import type { CollabRole } from '@/types/collab'

export type { Locale }

/**
 * i18n catalogs. English is the source locale; `it` is type-checked against
 * `typeof en`, so a missing or misshaped Italian key is a compile error.
 *
 * First translation slice (Phase i18n-1): TopBar, ProfileMenu, ShareDialog.
 * A few strings interpolated here originate in other modules and are still
 * English — the collaboration mode blurb (`collabPresentation`), the transport
 * capability sentence (provider definitions) and SyncEngine error text. They
 * are the next slices; everything authored in the three components above is
 * translated.
 */
export const en = {
  /** relative timestamps, shared by ProfileMenu + ShareDialog */
  time: {
    never: 'never',
    justNow: 'just now',
    seconds: (n: number) => `${n}s ago`,
    minutes: (n: number) => `${n}m ago`,
    hours: (n: number) => `${n}h ago`,
    days: (n: number) => `${n}d ago`,
  },

  /** primary view-mode labels (order stays in components/topbarModes.ts) */
  modes: {
    board: 'Board',
    graph: 'Graph',
    split: 'Split',
    doc: 'Document',
    sheet: 'Sheet',
    presentation: 'Presentation',
    code: 'Code',
    photo: 'Photo',
  },

  topbar: {
    quickCreate: 'Quick create',
    createNewItem: 'Create new item',
    new: 'New',
    create: {
      note: 'Note',
      document: 'Document',
      spreadsheet: 'Spreadsheet',
      presentation: 'Presentation',
      codeFile: 'Code file',
      board: 'Board',
    },
    viewModeGroup: 'View mode',
    viewSuffix: (label: string) => `${label} view`,
    workspaceTitle: (name: string) => `Workspace: ${name}`,
    graph: 'Graph',
    renameBoard: 'Rename board',
    renameBoardReadOnly: 'Read-only — your role cannot rename boards',
    boardName: 'Board name',
    comments: 'Comments',
    commentsOpenAria: (n: number) => `Comments (${n} open)`,
    versionHistory: 'Version history & activity',
    versionHistoryAria: 'Version history and activity',
    commandPalette: 'Command palette',
    openCommandPalette: 'Open command palette',
    share: 'Share',
    shareTitleRealtime: 'Share — members, roles & invites · realtime multiplayer is active',
    shareTitleScope: (scope: string) =>
      `Share — members, roles & invites · collaboration reaches ${scope}`,
    shareAria: (scope: string) => `Share project — collaboration reaches ${scope}`,
    themeToLight: 'Switch to light theme',
    themeToDark: 'Switch to dark theme',
  },

  /** cloud-sync status chip in the top bar */
  syncChip: {
    offline: 'Offline',
    offlineTitle: 'You are offline — changes stay local and sync when you reconnect',
    connecting: 'Connecting…',
    driveError: 'Drive error',
    driveNotConnected: 'Google Drive is not connected',
    driveErrorTitle: (err: string) => `${err} — click for diagnostics`,
    driveErrorAria: (err: string) => `Drive sync error: ${err}. Click for diagnostics.`,
    local: 'Local',
    localTitle: 'Cloud sync is off — click to connect Google Drive',
    syncing: 'Syncing…',
    synced: 'Synced',
    syncError: 'Sync error',
    pending: (n: number) => `${n} pending`,
    drive: 'Drive',
    driveTitle: 'Google Drive sync — click to sync now',
    driveAria: (label: string, isError: boolean) =>
      `Google Drive: ${label}${isError ? ' — click for diagnostics' : ' — click to sync now'}`,
  },

  profile: {
    signIn: 'Sign in',
    signInTitle: 'Sign in',
    signOut: 'Sign out',
    accountTitle: (name: string) => `${name} — account`,
    localOnlyAccount: 'local-only account',
    connectedServices: 'Connected services',
    connect: 'Connect',
    manage: 'Manage',
    connected: 'connected',
    off: 'off',
    driveFolder: (folder: string) => `folder “${folder}”`,
    driveNeedsOAuth: 'needs OAuth setup',
    driveConnecting: 'connecting…',
    driveNotConnected: 'not connected',
    githubDetail: (login: string) => `@${login} · code sync`,
    githubCodeOnly: 'code sync only',
    cloudSync: 'Cloud sync',
    syncNow: 'Sync now',
    fix: 'Fix',
    lastSync: (ago: string, pending: number) =>
      `last sync ${ago}${pending ? ` · ${pending} pending` : ''}`,
    conflicts: (n: number) =>
      `${n} conflict${n > 1 ? 's' : ''} resolved (newest won; older copies kept on Drive)`,
    /** persistent sync state line */
    status: {
      idle: 'Waiting for changes',
      connecting: 'Connecting to Drive…',
      syncing: 'Syncing…',
      synced: 'Up to date',
      offline: 'Offline — will resume',
      error: 'Sync error',
      disabled: 'Cloud sync off',
    } as Record<string, string>,
    /** language switcher */
    language: 'Language',
    english: 'English',
    italian: 'Italiano',
  },

  roles: {
    owner: 'Owner',
    admin: 'Admin',
    editor: 'Editor',
    commenter: 'Commenter',
    viewer: 'Viewer',
  } as Record<CollabRole, string>,

  roleDesc: {
    owner: 'Full access — delete project, transfer ownership, manage everything',
    admin: 'Manage files and members (except the owner), edit all content',
    editor: 'Create, edit and delete boards, docs, sheets, presentations and code',
    commenter: 'View everything, add comments, resolve own comments',
    viewer: 'Read-only access',
  } as Record<CollabRole, string>,

  share: {
    title: (name: string) => `Share “${name}”`,
    subtitle: (role: string, members: number, pending: number) =>
      `You are ${role} · ${members} member${members !== 1 ? 's' : ''}${
        pending ? ` · ${pending} pending` : ''
      }`,
    tabMembers: 'Members',
    tabSettings: 'Settings',
    close: 'Close share dialog',
    bannerRealtime: 'Realtime multiplayer',
    bannerScope: (scope: string) => `Collaboration scope: ${scope}`,
    // invite composer
    invitePlaceholder: 'Invite by email…',
    inviteeEmail: 'Invitee email',
    inviteeRole: 'Role for the invitee',
    invite: 'Invite',
    cannotManage: 'Your role can’t manage members.',
    invalidEmail: 'Invalid email address',
    inviteCreated: (email: string) => `Invite created for ${email}`,
    inviteCreatedBody:
      'Link copied — send it yourself. It works wherever this project’s data is reachable (same browser, or same Drive).',
    // member row
    you: '(you)',
    activeAgo: (ago: string) => `active ${ago}`,
    roleForAria: (name: string) => `Role for ${name}`,
    removeAria: (name: string) => `Remove ${name}`,
    removeFromProject: 'Remove from project',
    removeTitle: (name: string) => `Remove ${name}?`,
    removeBody: 'They lose access to this project. Their comments and activity are kept.',
    remove: 'Remove',
    transferTitleFor: (name: string) => `Transfer ownership to ${name}`,
    transferToMember: 'Transfer ownership to this member',
    transferTitle: 'Transfer ownership?',
    transferBody: (name: string) =>
      `${name} becomes the owner; you become an admin. This cannot be undone by you.`,
    transfer: 'Transfer',
    // invite row
    pending: 'pending',
    invitedLine: (role: string, ago: string, resent: string | null) =>
      `${role} · invited ${ago}${resent ? ` · resent ${resent}` : ''}`,
    copyLink: 'Copy invite link',
    copiedTitle: 'Invite link copied',
    copiedBody: 'Send it to the invitee yourself — Lattice has no email backend.',
    resendTitle: 'Resend (refreshes the invite; copy the link again)',
    resendAria: 'Resend invite',
    simulateTitle: 'Simulate acceptance (adds a mock member for testing roles)',
    simulateAria: 'Simulate invite acceptance',
    simulateJoined: (email: string) => `${email} joined (simulated)`,
    revoke: 'Revoke invite',
    // members footer note
    footerNote:
      'Invites work wherever this project’s data is reachable (see the collaboration scope above). “Simulate acceptance” (✓) creates a mock member so you can test roles offline.',
    // settings tab
    previewAsRole: 'Preview as role',
    previewAsRoleBody:
      'See the project the way a member with a different role sees it — read-only boards, hidden actions, comment-only access. Owner only; affects only you.',
    ownerMe: 'Owner (me)',
    transport: 'Collaboration transport',
    transportBody: 'Lattice never fakes realtime. What each available transport really delivers:',
    active: 'active',
    realtimeNotConfigured: 'Cross-device realtime: not configured',
    realtimeNotConfiguredBody:
      'Tabs of this browser already co-edit via CRDT; other devices sync through Google Drive. For live cross-device collaboration set VITE_REALTIME_BACKEND=liveblocks + LIVEBLOCKS_SECRET_KEY and sign in with Google — the status chip in the top bar has the full checklist.',
    publicLinks: 'Public links',
    publicLinksBody:
      'Sharing with people is role-based and server-enforced: invite them above and the realtime backend rejects anything their role does not allow. Truly public no-login links need an anonymous read-only viewer, which is not built yet — until then, share a copy instead: documents export to HTML/PDF/DOCX, presentations to PDF/PPTX, and the whole vault to a .lattice.json file. Nothing is ever exposed publicly by default.',
    rolesHeading: 'Roles',
  },
}

export type Catalog = typeof en

export const it: Catalog = {
  time: {
    never: 'mai',
    justNow: 'adesso',
    seconds: (n) => `${n}s fa`,
    minutes: (n) => `${n}m fa`,
    hours: (n) => `${n}h fa`,
    days: (n) => `${n}g fa`,
  },

  modes: {
    board: 'Board',
    graph: 'Grafo',
    split: 'Diviso',
    doc: 'Documento',
    sheet: 'Foglio',
    presentation: 'Presentazione',
    code: 'Codice',
    photo: 'Foto',
  },

  topbar: {
    quickCreate: 'Creazione rapida',
    createNewItem: 'Crea nuovo elemento',
    new: 'Nuovo',
    create: {
      note: 'Nota',
      document: 'Documento',
      spreadsheet: 'Foglio di calcolo',
      presentation: 'Presentazione',
      codeFile: 'File di codice',
      board: 'Board',
    },
    viewModeGroup: 'Modalità di visualizzazione',
    viewSuffix: (label) => `Vista ${label}`,
    workspaceTitle: (name) => `Workspace: ${name}`,
    graph: 'Grafo',
    renameBoard: 'Rinomina board',
    renameBoardReadOnly: 'Sola lettura — il tuo ruolo non può rinominare le board',
    boardName: 'Nome board',
    comments: 'Commenti',
    commentsOpenAria: (n) => `Commenti (${n} aperti)`,
    versionHistory: 'Cronologia versioni e attività',
    versionHistoryAria: 'Cronologia versioni e attività',
    commandPalette: 'Palette comandi',
    openCommandPalette: 'Apri la palette comandi',
    share: 'Condividi',
    shareTitleRealtime:
      'Condividi — membri, ruoli e inviti · il multiplayer realtime è attivo',
    shareTitleScope: (scope) =>
      `Condividi — membri, ruoli e inviti · la collaborazione raggiunge ${scope}`,
    shareAria: (scope) => `Condividi progetto — la collaborazione raggiunge ${scope}`,
    themeToLight: 'Passa al tema chiaro',
    themeToDark: 'Passa al tema scuro',
  },

  syncChip: {
    offline: 'Offline',
    offlineTitle:
      'Sei offline — le modifiche restano locali e si sincronizzano al ritorno online',
    connecting: 'Connessione…',
    driveError: 'Errore Drive',
    driveNotConnected: 'Google Drive non è collegato',
    driveErrorTitle: (err) => `${err} — clic per la diagnostica`,
    driveErrorAria: (err) => `Errore sync Drive: ${err}. Clic per la diagnostica.`,
    local: 'Locale',
    localTitle: 'Sync cloud disattivato — clic per collegare Google Drive',
    syncing: 'Sincronizzazione…',
    synced: 'Sincronizzato',
    syncError: 'Errore di sync',
    pending: (n) => `${n} in sospeso`,
    drive: 'Drive',
    driveTitle: 'Sync Google Drive — clic per sincronizzare ora',
    driveAria: (label, isError) =>
      `Google Drive: ${label}${
        isError ? ' — clic per la diagnostica' : ' — clic per sincronizzare ora'
      }`,
  },

  profile: {
    signIn: 'Accedi',
    signInTitle: 'Accedi',
    signOut: 'Esci',
    accountTitle: (name) => `${name} — account`,
    localOnlyAccount: 'account solo locale',
    connectedServices: 'Servizi collegati',
    connect: 'Collega',
    manage: 'Gestisci',
    connected: 'collegato',
    off: 'inattivo',
    driveFolder: (folder) => `cartella “${folder}”`,
    driveNeedsOAuth: 'richiede configurazione OAuth',
    driveConnecting: 'connessione…',
    driveNotConnected: 'non collegato',
    githubDetail: (login) => `@${login} · sync codice`,
    githubCodeOnly: 'solo sync del codice',
    cloudSync: 'Sync cloud',
    syncNow: 'Sincronizza ora',
    fix: 'Risolvi',
    lastSync: (ago, pending) =>
      `ultimo sync ${ago}${pending ? ` · ${pending} in sospeso` : ''}`,
    conflicts: (n) =>
      `${n} conflitt${
        n > 1 ? 'i risolti' : 'o risolto'
      } (ha vinto il più recente; le copie precedenti restano su Drive)`,
    status: {
      idle: 'In attesa di modifiche',
      connecting: 'Connessione a Drive…',
      syncing: 'Sincronizzazione…',
      synced: 'Aggiornato',
      offline: 'Offline — riprenderà',
      error: 'Errore di sync',
      disabled: 'Sync cloud disattivato',
    } as Record<string, string>,
    language: 'Lingua',
    english: 'English',
    italian: 'Italiano',
  },

  roles: {
    owner: 'Proprietario',
    admin: 'Amministratore',
    editor: 'Editor',
    commenter: 'Commentatore',
    viewer: 'Visualizzatore',
  } as Record<CollabRole, string>,

  roleDesc: {
    owner: 'Accesso completo — elimina il progetto, trasferisci la proprietà, gestisci tutto',
    admin: 'Gestisci file e membri (tranne il proprietario), modifica tutti i contenuti',
    editor: 'Crea, modifica ed elimina board, documenti, fogli, presentazioni e codice',
    commenter: 'Vedi tutto, aggiungi commenti, risolvi i tuoi commenti',
    viewer: 'Accesso in sola lettura',
  } as Record<CollabRole, string>,

  share: {
    title: (name) => `Condividi “${name}”`,
    subtitle: (role, members, pending) =>
      `Sei ${role} · ${members} membr${members !== 1 ? 'i' : 'o'}${
        pending ? ` · ${pending} in sospeso` : ''
      }`,
    tabMembers: 'Membri',
    tabSettings: 'Impostazioni',
    close: 'Chiudi la finestra di condivisione',
    bannerRealtime: 'Multiplayer realtime',
    bannerScope: (scope) => `Ambito collaborazione: ${scope}`,
    invitePlaceholder: 'Invita via email…',
    inviteeEmail: 'Email dell’invitato',
    inviteeRole: 'Ruolo dell’invitato',
    invite: 'Invita',
    cannotManage: 'Il tuo ruolo non può gestire i membri.',
    invalidEmail: 'Indirizzo email non valido',
    inviteCreated: (email) => `Invito creato per ${email}`,
    inviteCreatedBody:
      'Link copiato — invialo tu. Funziona ovunque i dati del progetto siano raggiungibili (stesso browser o stesso Drive).',
    you: '(tu)',
    activeAgo: (ago) => `attivo ${ago}`,
    roleForAria: (name) => `Ruolo per ${name}`,
    removeAria: (name) => `Rimuovi ${name}`,
    removeFromProject: 'Rimuovi dal progetto',
    removeTitle: (name) => `Rimuovere ${name}?`,
    removeBody:
      'Perde l’accesso al progetto. I suoi commenti e la sua attività vengono conservati.',
    remove: 'Rimuovi',
    transferTitleFor: (name) => `Trasferisci la proprietà a ${name}`,
    transferToMember: 'Trasferisci la proprietà a questo membro',
    transferTitle: 'Trasferire la proprietà?',
    transferBody: (name) =>
      `${name} diventa il proprietario; tu diventi amministratore. Non potrai annullare l’operazione.`,
    transfer: 'Trasferisci',
    pending: 'in sospeso',
    invitedLine: (role, ago, resent) =>
      `${role} · invitato ${ago}${resent ? ` · reinviato ${resent}` : ''}`,
    copyLink: 'Copia link d’invito',
    copiedTitle: 'Link d’invito copiato',
    copiedBody: 'Invialo tu alla persona invitata — Lattice non ha un backend email.',
    resendTitle: 'Reinvia (rigenera l’invito; ricopia il link)',
    resendAria: 'Reinvia invito',
    simulateTitle: 'Simula accettazione (aggiunge un membro fittizio per testare i ruoli)',
    simulateAria: 'Simula accettazione invito',
    simulateJoined: (email) => `${email} è entrato (simulato)`,
    revoke: 'Revoca invito',
    footerNote:
      'Gli inviti funzionano ovunque i dati del progetto siano raggiungibili (vedi l’ambito di collaborazione sopra). “Simula accettazione” (✓) crea un membro fittizio per testare i ruoli offline.',
    previewAsRole: 'Anteprima come ruolo',
    previewAsRoleBody:
      'Guarda il progetto come lo vede un membro con un ruolo diverso — board in sola lettura, azioni nascoste, accesso solo commenti. Solo per il proprietario; riguarda solo te.',
    ownerMe: 'Proprietario (io)',
    transport: 'Trasporto collaborazione',
    transportBody:
      'Lattice non finge mai il realtime. Cosa offre davvero ogni trasporto disponibile:',
    active: 'attivo',
    realtimeNotConfigured: 'Realtime cross-device: non configurato',
    realtimeNotConfiguredBody:
      'Le schede di questo browser co-editano già via CRDT; gli altri dispositivi si sincronizzano tramite Google Drive. Per la collaborazione live cross-device imposta VITE_REALTIME_BACKEND=liveblocks + LIVEBLOCKS_SECRET_KEY e accedi con Google — il chip di stato nella barra in alto ha la checklist completa.',
    publicLinks: 'Link pubblici',
    publicLinksBody:
      'La condivisione con le persone è basata sui ruoli e applicata dal server: invitale qui sopra e il backend realtime rifiuta tutto ciò che il loro ruolo non consente. I veri link pubblici senza login richiedono un visualizzatore anonimo in sola lettura, non ancora realizzato — nel frattempo condividi una copia: i documenti si esportano in HTML/PDF/DOCX, le presentazioni in PDF/PPTX e l’intero vault in un file .lattice.json. Nulla è mai esposto pubblicamente per impostazione predefinita.',
    rolesHeading: 'Ruoli',
  },
}

export const messages: Record<Locale, Catalog> = { en, it }

/** First-run default: honour an Italian browser, else fall back to English. */
export function detectLocale(): Locale {
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('it')) {
    return 'it'
  }
  return 'en'
}

/** Localised relative time, shared by every surface that shows timestamps. */
export function timeAgo(locale: Locale, ts: number | null | undefined): string {
  const t = messages[locale].time
  if (!ts) return t.never
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 10) return t.justNow
  if (s < 60) return t.seconds(s)
  if (s < 3600) return t.minutes(Math.floor(s / 60))
  if (s < 86400) return t.hours(Math.floor(s / 3600))
  return t.days(Math.floor(s / 86400))
}
