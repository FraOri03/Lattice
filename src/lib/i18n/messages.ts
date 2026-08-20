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
    /** planned environments — proper nouns, so most of these do not translate */
    comfyui: 'ComfyUI',
    aiDashboard: 'AI dashboard',
    trace: 'Trace',
    forge: 'Forge',
    folio: 'Folio',
    flux: 'Flux',
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
    /** accessible name of a section tab (Board, Document, …) */
    sectionAria: (label: string) => `${label} section`,
    /** Split is a layout, not a section — its tooltips say what it does */
    splitOpen: 'Split view — open a second pane beside the current one',
    splitClose: 'Split view — close the second pane',
    splitUnavailable: 'Split view is not available for this section',
    splitTooNarrow: 'Split view needs a wider window — two panes would leave neither usable',
    graphOpen: 'Graph view — browse relationships instead of the editor',
    graphOpenInPane: 'Graph view — show the relationship browser in the second pane',
    graphClose: 'Graph view — back to the section',
    graphCloseInPane: 'Graph view — hide it from the second pane',
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
    /** what each planned environment will be, for its disabled tab */
    plannedDomain: {
      comfyui: 'generative workflows',
      aiDashboard: 'models, usage & keys',
      trace: 'vector & illustration',
      forge: 'image & painting',
      folio: 'layout & publishing',
      flux: 'video & motion',
    },
    plannedTitle: (label: string, domain: string, phase: number) =>
      `${label} — ${domain} · phase ${phase}, not built yet`,
    plannedAria: (label: string) => `${label} — planned, not available yet`,
    /** whatever did not fit in the bar (12.3) */
    more: 'More controls',
  },

  /** the project call, in the top bar's status cluster */
  call: {
    join: 'Join call',
    joining: 'Joining…',
    inCall: 'In call',
    inCallTitle: 'You are in the project call — controls are in the call island, bottom right',
    joinTitle:
      'Join the project call — your microphone and camera stay off until you turn them on',
    retryTitle: (err: string) => `${err} — click to try again`,
    joinAria: 'Join the project call',
    unavailableAria: (why: string) => `Join call unavailable: ${why}`,
  },

  /**
   * Realtime chip labels. The popover's prose — setup instructions, the
   * offline and unconfigured explanations — is a later slice and is still
   * English, like the collabPresentation blurb noted at the top of this file.
   */
  realtime: {
    unconfigured: 'Realtime off',
    'no-account': 'Realtime: sign in',
    inactive: 'Realtime idle',
    connecting: 'Connecting…',
    connected: 'Live',
    reconnecting: 'Reconnecting…',
    offline: 'Offline',
    unauthorized: 'No access',
    error: 'Realtime error',
    aria: (label: string) => `Realtime collaboration: ${label}`,
    close: 'Close realtime status',
    dialog: 'Realtime collaboration status',
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
    exitGuest: 'Exit guest mode',
    exitGuestTitle: 'Leave guest mode and go back to the login screen',
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
    inviteEmailed: (email: string) => `Invitation e-mailed to ${email}`,
    inviteEmailedBody: 'The link is on your clipboard too, if you would rather send it yourself.',
    inviteMailFailed: 'The invitation exists, but the e-mail was not sent',
    inviteMailFailedBody: 'The link is copied — send it yourself, or try resending later.',
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
    noLinkTitle: 'No link on this device',
    noLinkBody:
      'The server keeps only a fingerprint of the link, so it exists on the device that created it and nowhere else. Resend the invitation to mint a fresh one.',
    resendFailed: 'The invitation could not be resent.',
    resendTitle: 'Resend (mints a new link; the previous one stops working)',
    resendAria: 'Resend invite',
    revoke: 'Revoke invite',
    // members footer note
    footerNote:
      'An invitation can only be accepted by the address it was sent to. To see the app as another role without a second person, use “Preview as role” in Settings.',
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

  /**
   * Mode toolbars (Phase 11.1). Every entry names something the product can
   * already do — the audit rule is that a toolbar never advertises a tool
   * that does not exist, so this catalogue stays deliberately short.
   */
  toolbar: {
    groups: {
      select: 'Selection tools',
      create: 'Creation tools',
      history: 'History',
      annotate: 'Annotation tools',
      integrate: 'Import and export',
    },
    photo: {
      label: 'Photo tools',
      select: 'Select',
      selectTip: 'Select tool',
      pan: 'Pan',
      panTip: 'Pan tool, or hold Space',
      addCamera: 'Add camera',
      addLight: 'Add light source',
      addPerson: 'Add person',
      addProp: 'Add generic prop',
      undo: 'Undo',
      redo: 'Redo',
      importScene: 'Import scene JSON',
      exportScene: 'Export scene as JSON',
      ai: 'AI assistant',
      aiTip: 'AI set designer',
    },
    board: {
      label: 'Board tools',
      section: 'Section',
      sectionTip: 'Add section — a labelled group on the board',
      note: 'Note',
      document: 'Document',
      spreadsheet: 'Spreadsheet',
      presentation: 'Presentation',
      code: 'Code',
      image: 'Image',
      video: 'Video',
      threeD: '3D',
      photo: 'Photo',
      link: 'Link',
      webEmbed: 'Web embed',
      import: 'Import',
      comment: 'Comment',
      commentTip: 'Comment — click to pin, drag to comment on an area',
      /** menu triggers are named for what they open, never a bare "More" */
      /** the tools that did not fit on the bar (12.4) */
    moreTools: 'More board tools',
    openCardTools: 'Open card tools',
      openMediaTools: 'Open media, embed & import tools',
      addTool: (tool: string) => `Add ${tool.toLowerCase()}`,
    },
    document: {
      label: 'Document formatting',
      groups: {
        textStyle: 'Text style',
        lists: 'Lists',
        blocks: 'Blocks',
        insert: 'Insert',
      },
      undo: 'Undo',
      redo: 'Redo',
      blockType: 'Block type',
      text: 'Text',
      heading: (level: number) => `Heading ${level}`,
      bold: 'Bold',
      italic: 'Italic',
      underline: 'Underline',
      strike: 'Strikethrough',
      inlineCode: 'Inline code',
      link: 'Link',
      bulletList: 'Bullet list',
      numberedList: 'Numbered list',
      checklist: 'Checklist',
      quote: 'Quote',
      codeBlock: 'Code block',
      callout: 'Callout',
      divider: 'Divider',
      insertTable: 'Insert table',
      insertImage: 'Insert image',
      embedAsset: 'Embed asset',
      table: {
        group: 'Table',
        addRow: 'Add row below',
        addColumn: 'Add column right',
        deleteRow: 'Delete row',
        deleteColumn: 'Delete column',
        headerRow: 'Toggle header row',
        deleteTable: 'Delete table',
      },
      linkPrompt: {
        title: 'Link',
        body: 'Paste a URL, or leave it empty to remove the link.',
        label: 'URL',
        confirm: 'Apply',
      },
    },
    /** Notes are markdown, not rich text: this bar is deliberately tiny. */
    note: {
      label: 'Note actions',
      viewGroup: 'View',
      write: 'Write',
      preview: 'Preview',
      exportMd: 'Export as Markdown',
      promote: 'Promote to document',
      close: 'Close editor',
    },
    sheet: {
      label: 'Cell formatting',
      groups: {
        clipboard: 'Clipboard',
        textStyle: 'Text style',
        colour: 'Colour',
        alignment: 'Alignment',
        format: 'Number format',
        styles: 'Cell styles',
        structure: 'Rows and columns',
        data: 'Data',
      },
      paste: 'Paste',
      cut: 'Cut',
      copy: 'Copy',
      bold: 'Bold',
      italic: 'Italic',
      underline: 'Underline',
      fontFamily: 'Font',
      fonts: {
        default: 'Default',
        sans: 'Sans',
        serif: 'Serif',
        mono: 'Mono',
      },
      fontSize: 'Font size',
      textColour: 'Text colour',
      fillColour: 'Fill colour',
      pickColour: (what: string) => `${what} — click to pick`,
      clearColour: (what: string) => `Clear ${what.toLowerCase()}`,
      borders: 'Borders',
      borderKinds: {
        placeholder: 'Borders…',
        all: 'All borders',
        outline: 'Outline',
        none: 'No border',
      },
      alignLeft: 'Align left',
      alignCenter: 'Align centre',
      alignRight: 'Align right',
      alignTop: 'Align top',
      alignMiddle: 'Align middle',
      alignBottom: 'Align bottom',
      wrap: 'Wrap text',
      numberFormat: 'Number format',
      /** every NumFmt needs a label here — the select is typed off this map */
      formats: {
        general: 'General',
        number: 'Number 1,234.56',
        integer: 'Integer 1,235',
        percent: 'Percent 12.3%',
        currency: 'Currency €',
        date: 'Date',
        time: 'Time',
        datetime: 'Date-time',
      },
      thousands: 'Thousands separator',
      increaseDecimals: 'Increase decimals',
      decreaseDecimals: 'Decrease decimals',
      decimalsNow: (n: number) => `${n} decimal places now`,
      cellStyle: 'Cell style',
      cellStylePlaceholder: 'Cell styles…',
      cellStyles: {
        normal: 'Normal',
        good: 'Good',
        bad: 'Bad',
        neutral: 'Neutral',
        heading: 'Heading',
      },
      insertRow: 'Insert row',
      insertRows: (n: number) => `Insert ${n} rows above`,
      insertRowOne: 'Insert 1 row above',
      deleteRow: 'Delete row',
      deleteRowOne: (row: number) => `Delete row ${row}`,
      deleteRowsRange: (from: number, to: number) => `Delete rows ${from}–${to}`,
      insertCol: 'Insert column',
      insertCols: (n: number) => `Insert ${n} columns left`,
      insertColOne: 'Insert 1 column left',
      deleteCol: 'Delete column',
      deleteColsSelected: 'Delete the selected columns',
      sortAsc: 'Sort ascending',
      sortAscTip:
        'Sort ascending by the active column — the whole table when one cell is selected',
      sortDesc: 'Sort descending',
      sortDescTip: 'Sort descending by the active column',
      dedupe: 'Remove duplicate rows',
      dedupeDone: (n: number) => `Removed ${n} duplicate row${n === 1 ? '' : 's'}`,
      dedupeNone: 'No duplicates found',
      dedupeNoneDetail: 'Every row in the range is unique.',
      findReplace: 'Find & replace',
      find: 'Find',
      replaceWith: 'Replace with',
      matchCase: 'Match case',
      replaceAll: 'Replace all',
      close: 'Close',
      replaced: (n: number) => `Replaced in ${n} cell${n === 1 ? '' : 's'}`,
      nothingToReplace: 'Nothing to replace',
      noMatch: (find: string) => `No cell matched “${find}”.`,
    },
    presentation: {
      label: 'Slide tools',
      groups: {
        insert: 'Insert',
        shapes: 'Shapes',
        background: 'Slide background',
        precision: 'Precision',
        arrange: 'Align and distribute',
        design: 'Design',
      },
      text: 'Text',
      addText: 'Add text box',
      image: 'Image',
      addImage: 'Add image',
      addRect: 'Add rectangle',
      addEllipse: 'Add ellipse',
      addLine: 'Add line',
      background: 'Background',
      backgroundColour: 'Slide background colour',
      resetBackground: 'Reset to the theme background',
      present: 'Present',
      presentDescription: 'Run this deck full screen from the current slide',
      chart: 'Chart',
      chartDescription: 'Insert a chart from a sheet range',
      table: 'Table',
      tableDescription: 'Insert a table',
      layout: 'Layout',
      layoutDescription: 'Arrange this slide with a layout',
      snap: 'Snapping',
      snapDescription: 'Snap to edges and centres, with smart guides',
      alignToSlide: 'Relative to the slide, since one element is selected',
      alignLeft: 'Align left',
      alignCenter: 'Align horizontal centres',
      alignRight: 'Align right',
      alignTop: 'Align top',
      alignMiddle: 'Align vertical centres',
      alignBottom: 'Align bottom',
      distributeH: 'Distribute horizontally',
      distributeV: 'Distribute vertically',
      /** distribution needs a middle element to move — two cannot be spread */
      needsThree: 'Select at least three elements',
      status: (n: number, total: number) =>
        `Slide ${n}/${total} · double-click text to edit · Del removes`,
      selection: (n: number) =>
        `${n} selected · arrows nudge · ⌫ removes`,
    },
    /**
     * Code has no toolbar and this phase does not invent one — it has a tab
     * strip and a file header, and these are their strings.
     */
    code: {
      tabs: 'Open code files',
      closeTab: (file: string) => `Close ${file}`,
      closeWorkspace: 'Close code workspace',
      fileName: 'File name',
      fileNamePlaceholder: 'filename',
      language: 'Language',
      lines: (n: number) => `${n} lines`,
      editor: 'Code editor',
    },
  },

  /** The open-entity tab strip (Phase 11.3) */
  tabs: {
    strip: 'Open in this project',
    empty: 'Nothing open yet',
    close: (name: string) => `Close ${name}`,
    next: 'Next tab',
    previous: 'Previous tab',
    closeCurrent: 'Close the current tab',
  },

  /**
   * The shell's side panels — the sidebar and the inspector (Phase 12.2).
   *
   * The verb takes the panel's title instead of being glued to it at the call
   * site: only the catalog knows how a name sits inside a sentence in its own
   * language, down to whether it is lowercased at all.
   */
  panel: {
    navigation: 'Navigation',
    inspector: 'Inspector',
    show: (title: string) => `Show ${title.toLowerCase()}`,
    hide: (title: string) => `Hide ${title.toLowerCase()}`,
    resize: (title: string) => `Resize ${title.toLowerCase()}`,
  },

  /** Home — the surface shown when no project is open (Phase 11.2) */
  dashboard: {
    title: 'Home',
    /**
     * Time-of-day rather than "welcome back": it carries information (it
     * tells you the app knows what time it is where you are) and it avoids
     * having to guess at anyone's grammatical gender in translation.
     */
    greeting: (name: string) => {
      const hour = new Date().getHours()
      const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
      return name ? `${part}, ${name}` : part
    },
    overview: 'Workspace at a glance',
    boards: 'Boards',
    files: 'Files',
    storage: 'Stored here',
    nothingStored: 'Empty',
    localOnly: 'Local vault — nothing leaves this browser',
    syncedAgo: (when: string) => `Cloud vault — synced ${when}`,
    syncPending: 'Cloud vault — not synced yet',
    boardCount: (n: number) => `${n} ${n === 1 ? 'board' : 'boards'}`,
    fileCount: (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`,
    inWorkspace: (workspace: string) => `in ${workspace}`,
    newProject: 'New project',
    search: 'Search',
    searchHint: 'Search files, boards and projects',
    recent: 'Recent',
    starred: 'Starred',
    projects: 'Projects',
    archived: 'Archived',
    recentFiles: 'Recent files',
    openRecent: (title: string, project: string) => `Open ${title} in ${project}`,
    openProject: (name: string) => `Open project ${name}`,
    updated: (when: string) => `Updated ${when}`,
    starredBadge: 'Starred',
    archivedBadge: 'Archived',
    noDescription: 'No description',
    emptyTitle: 'No projects in this workspace yet',
    emptyBody: 'A project holds its own boards, notes, documents and files.',
    workspaces: 'Workspaces',
    projectCount: (n: number) => `${n} ${n === 1 ? 'project' : 'projects'}`,
  },
  /**
   * The dashboard's six destinations (13.1, built in 15.1).
   *
   * `description` is the question each destination answers, straight from the
   * IA table — it is what the surface is *for*, and it stays true whether or not
   * the surface can be filled yet. What each one is allowed to SAY when it
   * cannot be filled lives in `honest` below.
   */
  destinations: {
    navLabel: 'Dashboard',
    workspaceLabel: 'Active workspace',
    projectCount: (n: number) => `${n} ${n === 1 ? 'project' : 'projects'}`,
    title: {
      home: 'Home',
      recents: 'Recents',
      starred: 'Starred',
      shared: 'Shared with me',
      invites: 'Invites',
      trash: 'Trash',
    },
    description: {
      home: 'What is in this workspace, and what you touched last.',
      recents: 'What you have opened, newest first.',
      starred: 'What you pinned, and where it is.',
      shared: 'What someone else has given you access to.',
      invites: 'Who is asking, and what you would be agreeing to.',
      trash: 'What you deleted, and how long you have.',
    },
  },
  /**
   * The three sections that cannot be complete before the server (13.3, 15.5).
   *
   * Every `why…` string names **the constraint, not the schedule**: "needs the
   * server planned for phase 18" is a fact about the product, "coming soon" is
   * a promise nobody is holding. And none of them says a section is empty —
   * that is the false negative the whole rule exists to prevent.
   */
  honest: {
    shared: {
      intro:
        'Access is granted per project, never workspace-wide: being in someone’s workspace does not give you their other projects.',
      scopeBrowser: 'This browser',
      scopeDrive: 'This Google Drive',
      scopeBrowserWhy: 'Shared inside this browser profile — visible on this device only.',
      scopeDriveWhy: 'Reaching you through the owner’s Google Drive folder.',
      unknownOwner: 'Owner not recorded',
      notHereYet: 'Not on this device yet',
      scopeServer: 'server',
      scopeServerWhy:
        'The server knows you are a member. The project itself has not reached this device, so it has no name here yet — open it from a device that holds it, or wait for Drive to sync.',
      whyPartial:
        'Only projects whose data already reaches this browser can be listed — shared inside this profile, or through a Drive folder you both hold. The full index needs a database and a signed-in session; this deployment has neither.',
      empty: 'No one has shared a project into this browser or this Drive folder.',
      grants: {
        admin: 'Manages members, roles and project settings. Cannot delete the project.',
        editor: 'Creates and edits boards, documents, notes, sheets and code.',
        commenter: 'Reads everything and leaves comments. Cannot change content.',
        viewer: 'Read-only access. Cannot comment or edit.',
      },
      role: (role: string) => `Role: ${role}`,
    },
    invites: {
      received: 'Received',
      sent: 'Sent',
      whyNoInbox:
        'Invitations waiting for you are read from the server, which needs a database and a signed-in session. This deployment has neither, so you learn of an invitation by opening its link.',
      receivedIntro: (addresses: string) =>
        `Invitations waiting for the addresses you have verified: ${addresses}.`,
      receivedEmpty: 'Nothing is waiting for you.',
      loading: 'Looking…',
      invitedBy: (who: string, role: string) => `${who} invited you as ${role}`,
      expires: (when: string) => `expires ${when}`,
      accept: 'Accept',
      decline: 'Decline',
      accepted: 'Invitation accepted',
      answerFailed: 'That invitation could not be answered',
      sentIntro:
        'Invitations you issued, gathered from the projects this device holds. Delivery is manual: copy the link and send it yourself.',
      sentEmpty: 'You haven’t invited anyone from this device yet.',
      copyLink: 'Copy link',
      copied: 'Link copied',
      status: {
        pending: 'Pending',
        accepted: 'Accepted',
        declined: 'Declined',
        revoked: 'Revoked',
        expired: 'Expired',
      },
      /** Said once, so no row implies a delivery the app cannot see. */
      noDeliveryClaim:
        'There is still no e-mail backend, so nothing here says delivered or failed. Expiry is real from phase 18.1: an invitation stops working two weeks after it was sent.',
      invitedTo: (email: string, project: string) => `${email} · ${project}`,
    },
    trash: {
      why: 'Deleting is still permanent: nothing records that an item was removed, when, or by whom, so there is no list to show and nothing to restore. Trash needs the soft-delete model tracked in issue #115.',
    },
  },
  /**
   * The two personal shelves (15.2). Every sentence with a name in it is a
   * function taking the name — no concatenation at the call site, so Italian
   * can put the pieces in its own order.
   */
  shelves: {
    today: 'Today',
    yesterday: 'Yesterday',
    workspaceFilter: 'Filter by workspace',
    allWorkspaces: 'All workspaces',
    noProject: 'No project',
    noWorkspace: 'No workspace',
    rowMeta: (project: string, workspace: string, when: string) =>
      `${project} · ${workspace} · ${when}`,
    starredMeta: (kind: string, project: string | null, workspace: string) =>
      project ? `${kind} · ${project} · ${workspace}` : `${kind} · ${workspace}`,
    kind: {
      project: 'Project',
      board: 'Board',
      doc: 'Document',
      note: 'Note',
      sheet: 'Spreadsheet',
      present: 'Presentation',
      code: 'Code file',
      asset: 'File',
    },
    recentsNote: (cap: number) =>
      `Written automatically as you open things, kept on this device only, and capped at the last ${cap} entries. It is not a backup and it does not sync — anything you want to keep in reach belongs in Starred.`,
    recentsEmptyTitle: 'Nothing opened yet',
    recentsEmptyBody: 'This list fills itself as you open boards, documents and files.',
    starredEmptyTitle: 'Nothing starred yet',
    starredEmptyBody: 'The star on any row or card pins it here, across every workspace.',
    noResultsBody: 'Choose “All workspaces” to see everything again.',
    selectedCount: (n: number) => `${n} selected`,
    unstarSelected: 'Unstar selected',
  },
  /**
   * The state a section shows instead of content (13.2 §5, 13.3).
   *
   * Every one follows the same shape: **what happened · what is still safe ·
   * what to do next**. A state that cannot name a cause is not ready to ship,
   * which is why `error` says the files are still on disk and `offline` says
   * the local ones still open.
   *
   * `unavailable` is the sixth, and the one the other five cannot express. Its
   * body is supplied by the caller, because the reason is different for every
   * section and naming the constraint is the whole point — "needs the server
   * planned for phase 18" is a fact, "coming soon" is a promise nobody holds.
   */
  states: {
    loading: (what: string) => `Reading ${what}…`,
    errorTitle: (what: string) => `Couldn’t read ${what}`,
    errorBody: 'Nothing has been lost — your files are still on this device. Reloading rebuilds the index.',
    errorAction: 'Reload',
    offlineTitle: 'You’re offline',
    offlineBody: 'What lives on this device still opens. Anything stored elsewhere reappears when the connection does.',
    noResultsTitle: 'Nothing matches these filters',
    noResultsBody: 'No item matches what you have narrowed to.',
    noResultsAction: 'Clear filters',
    unavailableTitle: (what: string) => `${what} isn’t available yet`,
  },
  /**
   * The status bars at the foot of the dashboard's navigation (13.3 shape 1).
   *
   * Two of the three are mostly reserved, and each `…Why` line says which
   * constraint holds it there — never a schedule, and never a number the app
   * could not have measured.
   */
  status: {
    off: 'off',
    runpod: 'RunPod credit',
    integration: 'Integration',
    apiKey: 'API key',
    balance: 'Balance',
    jobs: 'Jobs',
    notImplemented: 'not implemented',
    notSet: 'not set',
    disabled: 'disabled',
    runpodWhy:
      'Reserved space, deliberately empty: once a key exists this line shows balance, spend today and runway. Nothing is estimated in the meantime.',
    system: 'System',
    cpu: 'CPU',
    memory: 'Memory',
    gpu: 'GPU',
    disk: 'Disk',
    network: 'Network',
    systemWhy:
      'The browser can’t read these without a native host, so the row reports nothing rather than a plausible-looking guess.',
    storage: 'Storage',
    // "local" whether or not a mirror exists: this headline is the vault on
    // THIS device, and labelling it "Drive" was the bug
    storageLine: (size: string, synced: boolean) =>
      `${size} · ${synced ? 'local, mirrored' : 'local'}`,
    localVault: 'Local vault',
    assets: 'Assets',
    documents: 'Documents',
    documentsLine: (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`,
    vaultLine: (size: string, files: number) =>
      `${size} · ${files} ${files === 1 ? 'file' : 'files'}`,
    driveMirror: 'Drive mirror',
    driveAccount: 'Google account',
    quotaLine: (used: string, limit: string) => `${used} of ${limit} used`,
    measuring: 'measuring…',
    connected: 'connected',
    notConnected: 'not connected',
    trash: 'Trash',
    trashLine: (size: string, n: number) => `${size} · ${n} held`,
    freeSpace: 'Free space',
    storageWhy:
      'The vault line is what this origin actually occupies on disk; assets and documents are counted separately because only assets carry a byte size of their own. Deleted items keep occupying their bytes until the purge, which is why the trash gets its own line. Free space is what this browser will still let Lattice use, not the disk’s — that one is unreadable from a browser. The Drive mirror is measured on Drive and is normally larger: it also holds each project’s metadata and a readable copy of every document.',
  },
  /**
   * Trash (15.6). Every string here is careful about two facts the prototype's
   * own copy is careful about: the space is not free until the purge, and
   * Lattice's trash is not Drive's.
   */
  trash: {
    countLine: (n: number, size: string) =>
      `${n} ${n === 1 ? 'item' : 'items'} · ${size} still occupied until each one’s countdown ends`,
    nothingLine: (days: number) => `Nothing deleted · ${days}-day retention on this device`,
    retentionNote: (days: number) =>
      `Deleted items stay on this device for ${days} days, then Lattice removes them permanently — the countdown on each row is the real remaining time, not a suggestion. Space is only reclaimed after the purge. Anything also held in Google Drive is removed there at the same moment, and never before: emptying this trash is what reaches Drive, not the delete that put it here.`,
    emptyTrash: 'Empty trash',
    confirmEmpty: (n: number, size: string) =>
      `Permanently delete all ${n} ${n === 1 ? 'item' : 'items'} (${size})? This cannot be undone and there is no copy left on this device.`,
    keepThem: 'Keep them',
    deletePermanently: 'Delete permanently',
    emptyTitle: 'Trash is empty',
    emptyBody: (days: number) =>
      `Deleted projects and files wait here for ${days} days before Lattice removes them for good. Nothing is waiting right now.`,
    rowMeta: (kind: string, location: string, when: string, by: string | null) =>
      by ? `${kind} · was in ${location} · deleted ${when} by ${by}` : `${kind} · was in ${location} · deleted ${when}`,
    parentDeleted: 'parent deleted',
    purgingTonight: 'Purging tonight',
    inDays: (n: number) => `in ${n} ${n === 1 ? 'day' : 'days'}`,
    purgeOn: (date: string) => `Permanently removed on ${date}. Restore before then to keep it.`,
    restore: 'Restore',
    restoreToWhy: (location: string) => `Restore to ${location}`,
    restoreToTopWhy:
      'Its project is in the trash too, so this comes back on its own — restore the project to put it back where it was.',
    deleteForever: (name: string) => `Delete ${name} forever`,
  },
  /** Row and card anatomy — the accessible names actions carry (13.5 §8). */
  cards: {
    openItem: (name: string) => `Open ${name}`,
    select: (name: string) => `Select ${name}`,
    starLabel: (name: string) => `Star ${name}`,
    unstarLabel: (name: string) => `Unstar ${name}`,
    gridView: 'Grid view',
    listView: 'List view',
    membersTitle: (n: number) => `${n} ${n === 1 ? 'member' : 'members'} with access`,
    /** Sync scope on a card — the vault's, stated rather than implied. */
    syncLocal: 'Local',
    syncDrive: 'Drive',
    syncLocalWhy: 'This vault stays in this browser — nothing is uploaded.',
    syncDriveWhy: 'This vault is mirrored to your Google Drive folder.',
  },
  /**
   * What `announce()` says (13.5 §5). Functions, never concatenated at the call
   * site — an announcement is a sentence, and sentences do not survive being
   * glued together across locales.
   */
  announcements: {
    starred: (name: string) => `“${name}” starred`,
    unstarred: (name: string) => `“${name}” unstarred`,
    bulkUnstarred: (n: number) => `${n} ${n === 1 ? 'item' : 'items'} unstarred`,
    results: (n: number) => `${n} ${n === 1 ? 'result' : 'results'}`,
    created: (kind: string, name: string, project: string) =>
      `Created ${kind} “${name}” in ${project}`,
    filtersCleared: (n: number) => `Filters cleared — ${n} ${n === 1 ? 'item' : 'items'}`,
    workspaceSwitched: (name: string, projects: number) =>
      `${name} — ${projects} ${projects === 1 ? 'project' : 'projects'}`,
    gridView: 'Grid view',
    listView: 'List view',
    restored: (name: string, location: string) => `“${name}” restored to ${location}`,
    restoredToTop: (name: string) => `“${name}” restored — its project is still in the trash`,
    purged: (name: string) => `“${name}” permanently deleted`,
    purgedAll: (n: number) => `${n} ${n === 1 ? 'item' : 'items'} permanently deleted`,
    purgedOnOpen: (n: number) =>
      `${n} ${n === 1 ? 'item' : 'items'} passed 30 days and were removed`,
  },
  /**
   * The command palette (13.4, built in 15.3). One search and one create list,
   * so these strings are the only place either is named.
   */
  palette: {
    placeholder: 'Search files, boards and projects — or type a command…',
    label: 'Command palette',
    results: 'Results',
    sections: {
      recent: 'Recently opened',
      create: 'Create',
      goto: 'Go to',
      files: 'Files',
      boards: 'Boards',
      projects: 'Projects',
      workspace: 'Workspace',
      actions: 'Actions',
    },
    noResults: (query: string) => `Nothing matches “${query}”`,
    /** Search reaches what this device holds — 13.4 §2. Said, not implied. */
    driveScope:
      'Search reaches what this device holds. A project that lives only in someone else’s Drive folder has not been read here yet.',
    createNamed: (kind: string, name: string) => `Create ${kind} “${name}”`,
    inProject: (project: string) => `in ${project}`,
    currentProject: 'current',
    switchProject: 'switch project',
    switchWorkspace: 'switch workspace',
    /**
     * The utility commands. 15.3 localized what 13.4 specifies and left these,
     * which had been English literals since the palette was written; 13.5 §8
     * makes the whole catalogue this phase's, so they land here.
     */
    commands: {
      graph: 'Open Graph view',
      split: 'Toggle Split layout',
      toLight: 'Switch to light theme',
      toDark: 'Switch to dark theme',
      github: 'GitHub — sync code',
      drive: 'Google Drive — connect and diagnostics',
      share: 'Share — members and invites',
      comments: 'Comments',
      activity: 'Activity log',
      versions: 'Version history',
      shortcuts: 'Keyboard shortcuts',
      settings: 'Settings',
      syncNow: 'Sync now (Google Drive)',
      /** Sections inside the open project — hinted as `mode` in the list. */
      goToSection: (section: string) => `Go to ${section}`,
      modeHint: 'section',
    },
    /** The sections of an open project, named for the "Go to …" commands. */
    viewModes: {
      board: 'Board',
      doc: 'Document',
      sheet: 'Sheet',
      presentation: 'Presentation',
      code: 'Code',
      photo: 'Photo',
    },
  },
  /** The seven creation actions, and the target question (13.4 §6). */
  create: {
    kinds: {
      project: 'project',
      board: 'board',
      doc: 'document',
      note: 'Markdown note',
      sheet: 'spreadsheet',
      present: 'presentation',
      code: 'code file',
    },
    newLabel: (kind: string) => `New ${kind}`,
    createIn: (project: string) => `Create in ${project}`,
    chooseTarget: (kind: string) => `Where should the ${kind} go?`,
    noProjects: 'Create a project first — every file lives in one.',
    back: 'Back',
  },
  /**
   * The settings screen (Phase 14.1). `pending` is deliberately specific: a
   * panel that is not built yet says what will live there and what it waits
   * on, rather than "coming soon" — a promise nobody is holding.
   */
  settings: {
    title: 'Settings',
    open: 'Settings',
    close: 'Close settings',
    navLabel: 'Settings sections',
    sections: {
      account: 'Account',
      profile: 'Profile',
      appearance: 'Appearance',
      notifications: 'Notifications',
      security: 'Security',
      connections: 'Connected apps',
      storage: 'Storage and sync',
      billing: 'Plans and billing',
      developer: 'Developer',
    },
    intro: {
      account: 'Who you are signed in as, and how you leave.',
      profile: 'How you appear to the people you share with.',
      appearance: 'Theme, contrast, density, size, motion and language.',
      notifications: 'Which events reach you, and where.',
      security: 'Sessions, devices and what protects the vault.',
      connections: 'The services Lattice talks to, and what each one gets.',
      storage: 'Where your work lives and whether it is leaving this browser.',
      billing: 'What this build costs you.',
      developer: 'Build information and keyboard shortcuts.',
    },
    appearance: {
      system: 'System',
      themeHint: 'System follows your operating system and keeps following it.',
      contrast: 'High contrast',
      contrastHint:
        'Stronger borders, brighter secondary text and a thicker focus ring. The colours stay the same — only the distance between them changes.',
      contrastNormal: 'Normal',
      contrastHigh: 'High',
      density: 'Interface density',
      densityHint:
        'Compact tightens the controls that repeat down every panel. Tap targets keep their 24 px floor either way.',
      densityComfortable: 'Comfortable',
      densityCompact: 'Compact',
      size: 'UI size',
      sizeHint:
        'Scales the interface — panels, toolbars, dialogs. The board keeps its own zoom, so cards stay where you put them.',
      sizeSmall: 'Small',
      sizeDefault: 'Default',
      sizeLarge: 'Large',
      motion: 'Motion',
      motionHint:
        'System already honours “reduce motion” in your operating system. Choose Reduce to calm the app without changing anything outside it.',
      motionReduce: 'Reduce',
    },
    account: {
      emailLabel: 'Primary e-mail',
      emailFromGoogle: 'It comes from your Google account and changes there, not here.',
      emailLocal:
        'A placeholder for the local account. Nothing is ever sent to it — there is no mail in this build.',
      methods: 'Sign-in methods',
      methodGoogle: 'Google',
      methodGithub: 'GitHub',
      methodLocal: 'Local account',
      methodEmail: 'E-mail',
      idLabel: 'Account ID',
      idHint: 'The same whichever way you sign in. Quote it in a bug report.',
      created: 'Created',
    },
    profile: {
      avatar: 'Avatar',
      avatarHint:
        'Shown on cards, comments and presence. Downscaled and kept on this device with the rest of the vault — there is nowhere else to put it.',
      upload: 'Upload a picture',
      remove: 'Remove',
      displayName: 'Display name',
      displayNameHint: 'What people see on cards, comments and invitations.',
      providerSays: (name: string) => `Google says “${name}”.`,
      reset: 'Use that instead',
      saved: 'Profile updated',
      usage: 'How you use Lattice',
      usageHint:
        'Kept with your account so the answer exists before anything needs it. Nothing reads it yet, and it never leaves this device.',
      usagePersonal: 'Personal',
      usageWork: 'Work',
      usageEducation: 'Study',
      languageAt: 'The interface language is a display preference, so it lives in Appearance.',
      goAppearance: 'Open Appearance',
      avatarError: {
        'not-an-image': 'That file is not an image.',
        'too-large': 'That image is too large — pick one under 8 MB.',
        undecodable: 'That image could not be read.',
      },
    },
    connections: {
      factsTitle: 'Identity, storage and sync',
      factsBody:
        'Three answers, not one. Being signed in with Google says who you are; a connected folder says where files may go; a running sync says whether they are going there now.',
      identity: 'Identity',
      identityGoogle: (email: string) => `Signed in with Google as ${email}`,
      identityLocal: 'A local account — it exists in this browser only',
      identityNone: 'Not signed in. Everything still works, and stays here.',
      storage: 'Storage',
      storageDrive: (folder: string) => `Your Drive, in the ${folder} folder`,
      storageLocal: 'This browser only. Nothing has been uploaded.',
      sync: 'Sync',
      syncOff: 'Not running — there is nowhere to sync to yet',
      on: 'On',
      offLabel: 'Off',
      servicesTitle: 'Services',
      connect: 'Connect',
      disconnect: 'Disconnect',
      states: {
        connected: 'Connected',
        available: 'Not connected',
        unconfigured: 'Not in this build',
        blocked: 'Needs a Google sign-in',
      },
      services: {
        drive: 'Google Drive',
        github: 'GitHub',
        realtime: 'Realtime backend',
        livekit: 'LiveKit calls',
        conversion: 'Conversion worker',
      },
      gets: {
        drive:
          'The files of projects you sync, in a folder you can see. The scope is drive.file, so Lattice can only read what it created — never the rest of your Drive.',
        github:
          'Code documents only, committed to a feature branch you name. Notes, boards and everything else never leave for GitHub.',
        realtime:
          'Board operations, document and code edits, presence and cursors, relayed while a project is open. Your role is re-checked on the server for every one of them.',
        livekit:
          'Audio, camera and screen while a call is running. The media goes to LiveKit, never into the vault.',
        conversion:
          'Only the file you ask it to convert, for as long as the conversion takes.',
      },
      configuredBy: (variable: string) =>
        `Decided when this build was made (${variable}), so there is nothing to switch here.`,
      blocked:
        'Configured, but it authorises against a Google account and there is none signed in.',
    },
    security: {
      sessionTitle: 'This session',
      sessionBody:
        'One session, in this browser. Signing out removes the account from this device; the vault stays where it is.',
      signedInGoogle: (email: string) => `Signed in with Google as ${email}`,
      signedInLocal: 'A local account, created in this browser',
      signedOut: 'Not signed in',
      revokeTitle: 'Revoke Drive access',
      revokeBody:
        'Drops the Google token and asks Google to revoke it. Lattice loses access to the folder immediately; the files that are already there stay in your Drive, and the local vault is untouched.',
      revoke: 'Revoke access',
      revokeUnavailable: 'There is no Drive token to revoke.',
      protectionTitle: 'What protects your work',
      protectionVault:
        'The vault lives in this browser profile. Lattice adds no encryption of its own, so anyone who can open this browser can open the vault — encryption at rest is designed and not built.',
      protectionDrive:
        'Files mirrored to Drive are protected by your Google account, with whatever second factor it already enforces.',
      protectionServer:
        'When realtime is configured, the server verifies your Google token and mints the role itself: the browser’s claim about who it is is never trusted.',
      guestTitle: 'Guest session',
      guestBody:
        'This browser is being used without an account. Everything you make stays in a guest vault on this device, and signing in takes it with you. Leaving guest mode brings the login screen back — it keeps the vault, it does not delete it.',
      exitGuest: 'Exit guest mode',
      forgetTitle: 'Forget this device',
      forgetBody:
        'Deletes this vault from this browser: the projects, the document bodies and asset binaries in IndexedDB, the collaboration records, the Drive bookkeeping, and the GitHub and Gemini keys stored here. Anything mirrored to Drive stays in Drive. Nothing else on this machine is touched — another account’s vault is not this session’s to delete.',
      forget: 'Forget this device',
      forgetConfirmTitle: 'Delete this vault from this browser?',
      forgetConfirmBody:
        'This cannot be undone from here. Whatever has not reached Drive is gone with it.',
      forgetConfirm: 'Delete it',
      forgetBlocked: (n: number) =>
        `${n} database${n === 1 ? ' is' : 's are'} still open in another tab. Close the other tabs and run this again.`,
    },
    notifications: {
      intro:
        'Notifications are worked out on this device from what your projects already say, so what you switch off here is never raised in the first place.',
      event: 'Event',
      inApp: 'In app',
      email: 'E-mail',
      events: {
        mentions: 'Mentions',
        replies: 'Replies',
        assignments: 'Assignments',
        resolved: 'Resolved comments',
        invites: 'Invitations',
        sync: 'Sync failures',
        jobs: 'Background jobs',
        versions: 'Version restores',
      },
      eventHints: {
        mentions: 'Someone writes your name in a comment.',
        replies: 'A reply on a thread you started or joined.',
        assignments: 'A comment is assigned to you.',
        resolved: 'Your comment is resolved or reopened.',
        invites: 'You are invited to a project.',
        sync: 'Google Drive or the realtime connection stops working.',
        jobs: 'GitHub sync and file conversion report back.',
        versions: 'A version is restored over current work.',
      },
      emailDisabled:
        'E-mail has nowhere to go yet: there is no mail backend in this build, and no verified address to send to. Phase 18 builds both, and these switches are what it will read.',
      noProducer:
        'Three events the design asked for are not listed, because nothing raises them yet: due dates (nothing watches a comment’s due date), role changes (a role changes without announcing itself) and administrative activity (the activity log is a log, not a notification). A switch for them would control nothing.',
    },
    pending: {
      profileSignedOut:
        'A profile needs an account. Sign in from the Account section, or keep working without one — nothing here is required.',
      security:
        'Active sessions, devices and revocation are listed here once phases 16 and 17 give them something real to list.',
      billing:
        'Plans and billing arrive with phase 22. Nothing in this build is metered or charged.',
      accountMore:
        'Your id no longer comes from the provider (16.1), but there is still no second way of signing in to link, and the account cannot be deleted — e-mail sign-in arrives in phase 17. Signing out already removes it from this browser.',
      connectionsMore:
        'The realtime provider, LiveKit and the conversion backend join this list in 14.5.',
    },
    theme: 'Theme',
    themeDark: 'Dark',
    themeLight: 'Light',
    build: 'Build',
    shortcutsOpen: 'Open the shortcuts overview',
    notSignedIn: 'Not signed in',
    notSignedInBody:
      'Lattice works without an account — everything stays in this browser. Signing in with Google adds Drive sync and lets invitations be delivered.',
  },

  /**
   * Notes and documents are both text, so the product has to say out loud
   * which one is for what — otherwise the user picks by coin toss and the
   * two drift into the same thing.
   */
  textEntities: {
    notePurpose: 'Quick capture — markdown, links, no formatting to fuss with.',
    documentPurpose: 'Formatted, structured writing you finish and hand over.',
    noNoteOpen: 'No note open',
    newNote: 'New note',
    notesEmpty: 'Nothing captured yet',
    promoteTitle: (title: string) => `Promote “${title}” to a document?`,
    promoteBody:
      'The text, tags and wikilinks move into a new document you can format, ' +
      'outline and export. The note itself is consumed, so the same text never ' +
      'exists in two places — cards pointing at it are removed.',
    promoteConfirm: 'Promote',
    promoted: 'Promoted to a document',
    promotedDetail: (title: string) => `“${title}” is now a document.`,
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
    comfyui: 'ComfyUI',
    aiDashboard: 'Dashboard AI',
    trace: 'Trace',
    forge: 'Forge',
    folio: 'Folio',
    flux: 'Flux',
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
    sectionAria: (label) => `Sezione ${label}`,
    splitOpen: 'Vista divisa — apri un secondo pannello accanto a quello corrente',
    splitClose: 'Vista divisa — chiudi il secondo pannello',
    splitUnavailable: 'La vista divisa non è disponibile per questa sezione',
    splitTooNarrow:
      'La vista divisa richiede una finestra più larga — due riquadri non sarebbero usabili',
    graphOpen: "Vista grafo — esplora le relazioni invece dell'editor",
    graphOpenInPane: 'Vista grafo — mostra le relazioni nel secondo pannello',
    graphClose: 'Vista grafo — torna alla sezione',
    graphCloseInPane: 'Vista grafo — nascondila dal secondo pannello',
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
    plannedDomain: {
      comfyui: 'workflow generativi',
      aiDashboard: 'modelli, consumi e chiavi',
      trace: 'vettoriale e illustrazione',
      forge: 'immagine e pittura',
      folio: 'impaginazione ed editoria',
      flux: 'video e motion',
    },
    plannedTitle: (label, domain, phase) =>
      `${label} — ${domain} · fase ${phase}, non ancora realizzato`,
    plannedAria: (label) => `${label} — previsto, non ancora disponibile`,
    more: 'Altri controlli',
  },

  call: {
    join: 'Entra',
    joining: 'Connessione…',
    inCall: 'In chiamata',
    inCallTitle:
      'Sei nella chiamata del progetto — i controlli sono nell’isola in basso a destra',
    joinTitle:
      'Entra nella chiamata del progetto — microfono e videocamera restano spenti finché non li attivi',
    retryTitle: (err) => `${err} — clic per riprovare`,
    joinAria: 'Entra nella chiamata del progetto',
    unavailableAria: (why) => `Chiamata non disponibile: ${why}`,
  },

  realtime: {
    unconfigured: 'Realtime off',
    'no-account': 'Realtime: accedi',
    inactive: 'Realtime inattivo',
    connecting: 'Connessione…',
    connected: 'Live',
    reconnecting: 'Riconnessione…',
    offline: 'Offline',
    unauthorized: 'Nessun accesso',
    error: 'Errore realtime',
    aria: (label) => `Collaborazione realtime: ${label}`,
    close: 'Chiudi lo stato realtime',
    dialog: 'Stato della collaborazione realtime',
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
    exitGuest: 'Esci dalla modalità ospite',
    exitGuestTitle: 'Lascia la modalità ospite e torna alla schermata di accesso',
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
    inviteEmailed: (email) => `Invito inviato per e-mail a ${email}`,
    inviteEmailedBody: 'Il link è anche negli appunti, se preferisci mandarlo tu.',
    inviteMailFailed: 'L’invito esiste, ma l’e-mail non è partita',
    inviteMailFailedBody:
      'Il link è copiato: mandalo tu, oppure riprova a reinviare più tardi.',
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
    noLinkTitle: 'Nessun link su questo dispositivo',
    noLinkBody:
      'Il server conserva solo un’impronta del link, quindi il link esiste sul dispositivo che l’ha creato e da nessun’altra parte. Reinvia l’invito per generarne uno nuovo.',
    resendFailed: 'Non è stato possibile reinviare l’invito.',
    resendTitle: 'Reinvia (genera un link nuovo; il precedente smette di funzionare)',
    resendAria: 'Reinvia invito',
    revoke: 'Revoca invito',
    footerNote:
      'Un invito può essere accettato solo dall’indirizzo a cui è stato mandato. Per vedere l’app con un altro ruolo senza una seconda persona, usa “Anteprima come ruolo” nelle Impostazioni.',
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

  toolbar: {
    groups: {
      select: 'Strumenti di selezione',
      create: 'Strumenti di creazione',
      history: 'Cronologia',
      annotate: 'Strumenti di annotazione',
      integrate: 'Importazione ed esportazione',
    },
    photo: {
      label: 'Strumenti foto',
      select: 'Seleziona',
      selectTip: 'Strumento selezione',
      pan: 'Sposta',
      panTip: 'Strumento mano, o tieni premuto Spazio',
      addCamera: 'Aggiungi camera',
      addLight: 'Aggiungi fonte di luce',
      addPerson: 'Aggiungi persona',
      addProp: 'Aggiungi oggetto di scena',
      undo: 'Annulla',
      redo: 'Ripristina',
      importScene: 'Importa scena JSON',
      exportScene: 'Esporta scena come JSON',
      ai: 'Assistente AI',
      aiTip: 'Set designer AI',
    },
    board: {
      label: 'Strumenti board',
      section: 'Sezione',
      sectionTip: 'Aggiungi sezione — un gruppo con etichetta sulla board',
      note: 'Nota',
      document: 'Documento',
      spreadsheet: 'Foglio di calcolo',
      presentation: 'Presentazione',
      code: 'Codice',
      image: 'Immagine',
      video: 'Video',
      threeD: '3D',
      photo: 'Foto',
      link: 'Link',
      webEmbed: 'Incorpora pagina web',
      import: 'Importa',
      comment: 'Commento',
      commentTip: 'Commento — clic per fissare, trascina per commentare un’area',
      moreTools: 'Altri strumenti board',
      openCardTools: 'Apri strumenti card',
      openMediaTools: 'Apri strumenti media, incorporamento e importazione',
      addTool: (tool) => `Aggiungi ${tool.toLowerCase()}`,
    },
    document: {
      label: 'Formattazione documento',
      groups: {
        textStyle: 'Stile del testo',
        lists: 'Elenchi',
        blocks: 'Blocchi',
        insert: 'Inserisci',
      },
      undo: 'Annulla',
      redo: 'Ripristina',
      blockType: 'Tipo di blocco',
      text: 'Testo',
      heading: (level) => `Titolo ${level}`,
      bold: 'Grassetto',
      italic: 'Corsivo',
      underline: 'Sottolineato',
      strike: 'Barrato',
      inlineCode: 'Codice inline',
      link: 'Link',
      bulletList: 'Elenco puntato',
      numberedList: 'Elenco numerato',
      checklist: 'Elenco di controllo',
      quote: 'Citazione',
      codeBlock: 'Blocco di codice',
      callout: 'Riquadro informativo',
      divider: 'Separatore',
      insertTable: 'Inserisci tabella',
      insertImage: 'Inserisci immagine',
      embedAsset: 'Incorpora file',
      table: {
        group: 'Tabella',
        addRow: 'Aggiungi riga sotto',
        addColumn: 'Aggiungi colonna a destra',
        deleteRow: 'Elimina riga',
        deleteColumn: 'Elimina colonna',
        headerRow: 'Attiva/disattiva riga di intestazione',
        deleteTable: 'Elimina tabella',
      },
      linkPrompt: {
        title: 'Link',
        body: 'Incolla un URL, oppure lascia vuoto per rimuovere il link.',
        label: 'URL',
        confirm: 'Applica',
      },
    },
    note: {
      label: 'Azioni nota',
      viewGroup: 'Vista',
      write: 'Scrivi',
      preview: 'Anteprima',
      exportMd: 'Esporta come Markdown',
      promote: 'Promuovi a documento',
      close: 'Chiudi editor',
    },
    sheet: {
      label: 'Formattazione celle',
      groups: {
        clipboard: 'Appunti',
        textStyle: 'Stile del testo',
        colour: 'Colore',
        alignment: 'Allineamento',
        format: 'Formato numero',
        styles: 'Stili cella',
        structure: 'Righe e colonne',
        data: 'Dati',
      },
      paste: 'Incolla',
      cut: 'Taglia',
      copy: 'Copia',
      bold: 'Grassetto',
      italic: 'Corsivo',
      underline: 'Sottolineato',
      fontFamily: 'Carattere',
      fonts: {
        default: 'Predefinito',
        sans: 'Senza grazie',
        serif: 'Con grazie',
        mono: 'Monospazio',
      },
      fontSize: 'Dimensione carattere',
      textColour: 'Colore testo',
      fillColour: 'Colore sfondo',
      pickColour: (what) => `${what} — clic per scegliere`,
      clearColour: (what) => `Rimuovi ${what.toLowerCase()}`,
      borders: 'Bordi',
      borderKinds: {
        placeholder: 'Bordi…',
        all: 'Tutti i bordi',
        outline: 'Contorno',
        none: 'Nessun bordo',
      },
      alignLeft: 'Allinea a sinistra',
      alignCenter: 'Allinea al centro',
      alignRight: 'Allinea a destra',
      alignTop: 'Allinea in alto',
      alignMiddle: 'Allinea al centro verticalmente',
      alignBottom: 'Allinea in basso',
      wrap: 'Testo a capo',
      numberFormat: 'Formato numero',
      formats: {
        general: 'Generale',
        number: 'Numero 1.234,56',
        integer: 'Intero 1.235',
        percent: 'Percentuale 12,3%',
        currency: 'Valuta €',
        date: 'Data',
        time: 'Ora',
        datetime: 'Data e ora',
      },
      thousands: 'Separatore delle migliaia',
      increaseDecimals: 'Aumenta i decimali',
      decreaseDecimals: 'Riduci i decimali',
      decimalsNow: (n) => `ora ${n} cifre decimali`,
      cellStyle: 'Stile cella',
      cellStylePlaceholder: 'Stili cella…',
      cellStyles: {
        normal: 'Normale',
        good: 'Positivo',
        bad: 'Negativo',
        neutral: 'Neutro',
        heading: 'Titolo',
      },
      insertRow: 'Inserisci riga',
      insertRows: (n) => `Inserisci ${n} righe sopra`,
      insertRowOne: 'Inserisci 1 riga sopra',
      deleteRow: 'Elimina riga',
      deleteRowOne: (row) => `Elimina la riga ${row}`,
      deleteRowsRange: (from, to) => `Elimina le righe ${from}–${to}`,
      insertCol: 'Inserisci colonna',
      insertCols: (n) => `Inserisci ${n} colonne a sinistra`,
      insertColOne: 'Inserisci 1 colonna a sinistra',
      deleteCol: 'Elimina colonna',
      deleteColsSelected: 'Elimina le colonne selezionate',
      sortAsc: 'Ordina in modo crescente',
      sortAscTip:
        'Ordina in modo crescente per la colonna attiva — tutta la tabella se è selezionata una sola cella',
      sortDesc: 'Ordina in modo decrescente',
      sortDescTip: 'Ordina in modo decrescente per la colonna attiva',
      dedupe: 'Rimuovi le righe duplicate',
      dedupeDone: (n) => `Rimosse ${n} righe duplicate`,
      dedupeNone: 'Nessun duplicato trovato',
      dedupeNoneDetail: 'Ogni riga dell’intervallo è unica.',
      findReplace: 'Trova e sostituisci',
      find: 'Trova',
      replaceWith: 'Sostituisci con',
      matchCase: 'Maiuscole/minuscole',
      replaceAll: 'Sostituisci tutto',
      close: 'Chiudi',
      replaced: (n) => `Sostituito in ${n} celle`,
      nothingToReplace: 'Niente da sostituire',
      noMatch: (find) => `Nessuna cella corrisponde a “${find}”.`,
    },
    presentation: {
      label: 'Strumenti diapositiva',
      groups: {
        insert: 'Inserisci',
        shapes: 'Forme',
        background: 'Sfondo diapositiva',
        precision: 'Precisione',
        arrange: 'Allinea e distribuisci',
        design: 'Progettazione',
      },
      text: 'Testo',
      addText: 'Aggiungi casella di testo',
      image: 'Immagine',
      addImage: 'Aggiungi immagine',
      addRect: 'Aggiungi rettangolo',
      addEllipse: 'Aggiungi ellisse',
      addLine: 'Aggiungi linea',
      background: 'Sfondo',
      backgroundColour: 'Colore di sfondo della diapositiva',
      resetBackground: 'Ripristina lo sfondo del tema',
      present: 'Presenta',
      presentDescription: 'Esegui il deck a schermo intero dalla diapositiva corrente',
      chart: 'Grafico',
      chartDescription: 'Inserisci un grafico da un intervallo di foglio',
      table: 'Tabella',
      tableDescription: 'Inserisci una tabella',
      layout: 'Layout',
      layoutDescription: 'Disponi questa diapositiva con un layout',
      snap: 'Aggancio',
      snapDescription: 'Aggancia a bordi e centri, con guide intelligenti',
      alignToSlide: 'Rispetto alla diapositiva, perché è selezionato un solo elemento',
      alignLeft: 'Allinea a sinistra',
      alignCenter: 'Allinea ai centri orizzontali',
      alignRight: 'Allinea a destra',
      alignTop: 'Allinea in alto',
      alignMiddle: 'Allinea ai centri verticali',
      alignBottom: 'Allinea in basso',
      distributeH: 'Distribuisci orizzontalmente',
      distributeV: 'Distribuisci verticalmente',
      needsThree: 'Seleziona almeno tre elementi',
      status: (n, total) =>
        `Diapositiva ${n}/${total} · doppio clic sul testo per modificarlo · Canc elimina`,
      selection: (n) => `${n} selezionati · le frecce spostano · ⌫ elimina`,
    },
    code: {
      tabs: 'File di codice aperti',
      closeTab: (file) => `Chiudi ${file}`,
      closeWorkspace: 'Chiudi il workspace codice',
      fileName: 'Nome file',
      fileNamePlaceholder: 'nomefile',
      language: 'Linguaggio',
      lines: (n) => `${n} righe`,
      editor: 'Editor di codice',
    },
  },

  tabs: {
    strip: 'Aperti in questo progetto',
    empty: 'Ancora niente di aperto',
    close: (name) => `Chiudi ${name}`,
    next: 'Scheda successiva',
    previous: 'Scheda precedente',
    closeCurrent: 'Chiudi la scheda corrente',
  },

  panel: {
    navigation: 'Navigazione',
    inspector: 'Ispettore',
    show: (title) => `Mostra ${title.toLowerCase()}`,
    hide: (title) => `Nascondi ${title.toLowerCase()}`,
    resize: (title) => `Ridimensiona ${title.toLowerCase()}`,
  },

  dashboard: {
    title: 'Home',
    greeting: (name) => {
      const hour = new Date().getHours()
      const part = hour < 12 ? 'Buongiorno' : hour < 18 ? 'Buon pomeriggio' : 'Buonasera'
      return name ? `${part}, ${name}` : part
    },
    overview: 'Il workspace in sintesi',
    boards: 'Board',
    files: 'File',
    storage: 'Archiviati qui',
    nothingStored: 'Vuoto',
    localOnly: 'Vault locale — non esce da questo browser',
    syncedAgo: (when) => `Vault cloud — sincronizzato ${when}`,
    syncPending: 'Vault cloud — non ancora sincronizzato',
    boardCount: (n) => `${n} board`,
    fileCount: (n) => `${n} file`,
    inWorkspace: (workspace) => `in ${workspace}`,
    newProject: 'Nuovo progetto',
    search: 'Cerca',
    searchHint: 'Cerca file, board e progetti',
    recent: 'Recenti',
    starred: 'Preferiti',
    projects: 'Progetti',
    archived: 'Archiviati',
    recentFiles: 'File recenti',
    openRecent: (title, project) => `Apri ${title} in ${project}`,
    openProject: (name) => `Apri il progetto ${name}`,
    updated: (when) => `Aggiornato ${when}`,
    starredBadge: 'Preferito',
    archivedBadge: 'Archiviato',
    noDescription: 'Nessuna descrizione',
    emptyTitle: 'Ancora nessun progetto in questo workspace',
    emptyBody: 'Un progetto contiene le sue board, note, documenti e file.',
    workspaces: 'Workspace',
    projectCount: (n) => `${n} ${n === 1 ? 'progetto' : 'progetti'}`,
  },
  destinations: {
    navLabel: 'Dashboard',
    workspaceLabel: 'Workspace attivo',
    projectCount: (n) => `${n} ${n === 1 ? 'progetto' : 'progetti'}`,
    title: {
      home: 'Home',
      recents: 'Recenti',
      starred: 'Preferiti',
      shared: 'Condivisi con me',
      invites: 'Inviti',
      trash: 'Cestino',
    },
    description: {
      home: 'Cosa c’è in questo workspace, e cosa hai aperto per ultimo.',
      recents: 'Cosa hai aperto, dal più recente.',
      starred: 'Cosa hai messo tra i preferiti, e dove si trova.',
      shared: 'A cosa qualcun altro ti ha dato accesso.',
      invites: 'Chi ti sta invitando, e a cosa acconsentiresti.',
      trash: 'Cosa hai eliminato, e quanto tempo ti resta.',
    },
  },
  honest: {
    shared: {
      intro:
        'L’accesso è concesso per progetto, mai per l’intero workspace: stare nel workspace di qualcuno non ti dà i suoi altri progetti.',
      scopeBrowser: 'Questo browser',
      scopeDrive: 'Questo Google Drive',
      scopeBrowserWhy:
        'Condiviso dentro questo profilo browser — visibile solo su questo dispositivo.',
      scopeDriveWhy: 'Ti arriva attraverso la cartella Google Drive del proprietario.',
      unknownOwner: 'Proprietario non registrato',
      notHereYet: 'Non ancora su questo dispositivo',
      scopeServer: 'server',
      scopeServerWhy:
        'Il server sa che sei un membro. Il progetto non è ancora arrivato su questo dispositivo, quindi qui non ha un nome: aprilo da un dispositivo che lo contiene, o aspetta la sincronizzazione con Drive.',
      whyPartial:
        'Si possono elencare solo i progetti i cui dati arrivano già a questo browser — condivisi dentro questo profilo, o attraverso una cartella Drive che avete entrambi. L’indice completo richiede un database e una sessione attiva: questo deployment non ha né l’uno né l’altra.',
      empty: 'Nessuno ha condiviso un progetto dentro questo browser o questa cartella Drive.',
      grants: {
        admin:
          'Gestisce membri, ruoli e impostazioni del progetto. Non può eliminare il progetto.',
        editor: 'Crea e modifica board, documenti, note, fogli e codice.',
        commenter: 'Legge tutto e lascia commenti. Non può cambiare i contenuti.',
        viewer: 'Accesso in sola lettura. Non può commentare né modificare.',
      },
      role: (role) => `Ruolo: ${role}`,
    },
    invites: {
      received: 'Ricevuti',
      sent: 'Inviati',
      whyNoInbox:
        'Gli inviti in attesa si leggono dal server, che richiede un database e una sessione attiva. Questo deployment non ha né l’uno né l’altra, quindi scopri un invito aprendone il link.',
      receivedIntro: (addresses) =>
        `Inviti in attesa per gli indirizzi che hai verificato: ${addresses}.`,
      receivedEmpty: 'Non c’è nulla in attesa per te.',
      loading: 'Cerco…',
      invitedBy: (who, role) => `${who} ti ha invitato come ${role}`,
      expires: (when) => `scade ${when}`,
      accept: 'Accetta',
      decline: 'Rifiuta',
      accepted: 'Invito accettato',
      answerFailed: 'Non è stato possibile rispondere a questo invito',
      sentIntro:
        'Gli inviti che hai emesso, raccolti dai progetti che questo dispositivo contiene. La consegna è manuale: copia il link e mandalo tu.',
      sentEmpty: 'Non hai ancora invitato nessuno da questo dispositivo.',
      copyLink: 'Copia il link',
      copied: 'Link copiato',
      status: {
        pending: 'In attesa',
        accepted: 'Accettato',
        declined: 'Rifiutato',
        revoked: 'Revocato',
        expired: 'Scaduto',
      },
      noDeliveryClaim:
        'Continua a non esserci un backend e-mail, quindi qui niente dice consegnato o fallito. La scadenza invece è reale dalla fase 18.1: un invito smette di funzionare due settimane dopo l’invio.',
      invitedTo: (email, project) => `${email} · ${project}`,
    },
    trash: {
      why: 'Eliminare è ancora definitivo: niente registra che un elemento è stato rimosso, quando o da chi, quindi non c’è un elenco da mostrare né niente da ripristinare. Il Cestino richiede il modello di eliminazione reversibile tracciato nella issue #115.',
    },
  },
  shelves: {
    today: 'Oggi',
    yesterday: 'Ieri',
    workspaceFilter: 'Filtra per workspace',
    allWorkspaces: 'Tutti i workspace',
    noProject: 'Nessun progetto',
    noWorkspace: 'Nessun workspace',
    rowMeta: (project, workspace, when) => `${project} · ${workspace} · ${when}`,
    starredMeta: (kind, project, workspace) =>
      project ? `${kind} · ${project} · ${workspace}` : `${kind} · ${workspace}`,
    kind: {
      project: 'Progetto',
      board: 'Board',
      doc: 'Documento',
      note: 'Nota',
      sheet: 'Foglio di calcolo',
      present: 'Presentazione',
      code: 'File di codice',
      asset: 'File',
    },
    recentsNote: (cap) =>
      `Scritto automaticamente mentre apri le cose, tenuto solo su questo dispositivo e limitato alle ultime ${cap} voci. Non è un backup e non si sincronizza — ciò che vuoi tenere a portata di mano va nei Preferiti.`,
    recentsEmptyTitle: 'Non hai ancora aperto niente',
    recentsEmptyBody: 'Questo elenco si riempie da solo mentre apri board, documenti e file.',
    starredEmptyTitle: 'Nessun preferito',
    starredEmptyBody:
      'La stella su una riga o una card lo fissa qui, da tutti i workspace.',
    noResultsBody: 'Scegli “Tutti i workspace” per rivedere tutto.',
    selectedCount: (n) => `${n} selezionati`,
    unstarSelected: 'Togli dai preferiti',
  },
  states: {
    loading: (what) => `Lettura di ${what}…`,
    errorTitle: (what) => `Impossibile leggere ${what}`,
    errorBody:
      'Non è andato perso niente — i tuoi file sono ancora su questo dispositivo. Ricaricare ricostruisce l’indice.',
    errorAction: 'Ricarica',
    offlineTitle: 'Sei offline',
    offlineBody:
      'Ciò che vive su questo dispositivo si apre comunque. Quello archiviato altrove torna appena torna la connessione.',
    noResultsTitle: 'Nessun elemento corrisponde ai filtri',
    noResultsBody: 'Nessun elemento rientra in ciò a cui hai ristretto.',
    noResultsAction: 'Azzera i filtri',
    unavailableTitle: (what) => `${what} non è ancora disponibile`,
  },
  status: {
    off: 'off',
    runpod: 'Credito RunPod',
    integration: 'Integrazione',
    apiKey: 'Chiave API',
    balance: 'Saldo',
    jobs: 'Job',
    notImplemented: 'non implementata',
    notSet: 'non impostata',
    disabled: 'disattivati',
    runpodWhy:
      'Spazio riservato, deliberatamente vuoto: quando esisterà una chiave questa riga mostrerà saldo, spesa di oggi e autonomia. Nel frattempo non si stima niente.',
    system: 'Sistema',
    cpu: 'CPU',
    memory: 'Memoria',
    gpu: 'GPU',
    disk: 'Disco',
    network: 'Rete',
    systemWhy:
      'Il browser non può leggerli senza un host nativo, quindi la riga non riporta niente invece di una stima che sembrerebbe vera.',
    storage: 'Archiviazione',
    storageLine: (size, synced) => `${size} · ${synced ? 'locale, con copia' : 'locale'}`,
    localVault: 'Vault locale',
    assets: 'Asset',
    documents: 'Documenti',
    documentsLine: (n) => `${n} file`,
    vaultLine: (size, files) => `${size} · ${files} file`,
    driveMirror: 'Copia su Drive',
    driveAccount: 'Account Google',
    quotaLine: (used, limit) => `${used} di ${limit} usati`,
    measuring: 'misurazione…',
    connected: 'connessa',
    notConnected: 'non connessa',
    trash: 'Cestino',
    trashLine: (size, n) => `${size} · ${n} in attesa`,
    freeSpace: 'Spazio libero',
    storageWhy:
      'La riga del vault è ciò che questa origine occupa davvero su disco; asset e documenti sono contati a parte perché solo gli asset hanno una dimensione propria in byte. Gli elementi eliminati continuano a occupare i loro byte fino alla rimozione, ed è per questo che il cestino ha una riga a sé. Lo spazio libero è quello che questo browser concede ancora a Lattice, non quello del disco: il disco un browser non può leggerlo. La copia su Drive è misurata su Drive ed è normalmente più grande, perché contiene anche i metadati di ogni progetto e una copia leggibile di ogni documento.',
  },
  trash: {
    countLine: (n, size) =>
      `${n} ${n === 1 ? 'elemento' : 'elementi'} · ${size} ancora occupati finché non scade il conto alla rovescia di ciascuno`,
    nothingLine: (days) => `Niente di eliminato · conservazione ${days} giorni su questo dispositivo`,
    retentionNote: (days) =>
      `Gli elementi eliminati restano su questo dispositivo per ${days} giorni, poi Lattice li rimuove definitivamente — il conto alla rovescia su ogni riga è il tempo reale che resta, non un’indicazione. Lo spazio si libera solo dopo la rimozione. Ciò che sta anche su Google Drive viene rimosso lì nello stesso momento, e mai prima: è svuotare questo cestino ad arrivare a Drive, non l’eliminazione che ce l’ha messo.`,
    emptyTrash: 'Svuota il cestino',
    confirmEmpty: (n, size) =>
      `Eliminare definitivamente tutti i ${n} ${n === 1 ? 'elemento' : 'elementi'} (${size})? Non si può annullare e non resta nessuna copia su questo dispositivo.`,
    keepThem: 'Tienili',
    deletePermanently: 'Elimina definitivamente',
    emptyTitle: 'Il cestino è vuoto',
    emptyBody: (days) =>
      `I progetti e i file eliminati aspettano qui ${days} giorni prima che Lattice li rimuova per sempre. Al momento non c’è niente in attesa.`,
    rowMeta: (kind, location, when, by) =>
      by ? `${kind} · era in ${location} · eliminato ${when} da ${by}` : `${kind} · era in ${location} · eliminato ${when}`,
    parentDeleted: 'progetto eliminato',
    purgingTonight: 'Rimosso stanotte',
    inDays: (n) => `tra ${n} ${n === 1 ? 'giorno' : 'giorni'}`,
    purgeOn: (date) => `Rimosso definitivamente il ${date}. Ripristinalo prima per tenerlo.`,
    restore: 'Ripristina',
    restoreToWhy: (location) => `Ripristina in ${location}`,
    restoreToTopWhy:
      'Anche il suo progetto è nel cestino, quindi torna da solo — ripristina il progetto per rimetterlo dov’era.',
    deleteForever: (name) => `Elimina ${name} per sempre`,
  },
  cards: {
    openItem: (name) => `Apri ${name}`,
    select: (name) => `Seleziona ${name}`,
    starLabel: (name) => `Aggiungi ${name} ai preferiti`,
    unstarLabel: (name) => `Togli ${name} dai preferiti`,
    gridView: 'Vista a griglia',
    listView: 'Vista a elenco',
    membersTitle: (n) => `${n} ${n === 1 ? 'membro' : 'membri'} con accesso`,
    syncLocal: 'Locale',
    syncDrive: 'Drive',
    syncLocalWhy: 'Questo vault resta in questo browser — non viene caricato niente.',
    syncDriveWhy: 'Questo vault è replicato nella tua cartella Google Drive.',
  },
  announcements: {
    starred: (name) => `“${name}” aggiunto ai preferiti`,
    unstarred: (name) => `“${name}” tolto dai preferiti`,
    bulkUnstarred: (n) => `${n} ${n === 1 ? 'elemento tolto' : 'elementi tolti'} dai preferiti`,
    results: (n) => `${n} ${n === 1 ? 'risultato' : 'risultati'}`,
    created: (kind, name, project) => `Creato: ${kind} “${name}” in ${project}`,
    filtersCleared: (n) => `Filtri azzerati — ${n} ${n === 1 ? 'elemento' : 'elementi'}`,
    workspaceSwitched: (name, projects) =>
      `${name} — ${projects} ${projects === 1 ? 'progetto' : 'progetti'}`,
    gridView: 'Vista a griglia',
    listView: 'Vista a elenco',
    restored: (name, location) => `“${name}” ripristinato in ${location}`,
    restoredToTop: (name) => `“${name}” ripristinato — il suo progetto è ancora nel cestino`,
    purged: (name) => `“${name}” eliminato definitivamente`,
    purgedAll: (n) => `${n} ${n === 1 ? 'elemento eliminato' : 'elementi eliminati'} definitivamente`,
    purgedOnOpen: (n) =>
      `${n} ${n === 1 ? 'elemento ha superato' : 'elementi hanno superato'} i 30 giorni e ${n === 1 ? 'è stato rimosso' : 'sono stati rimossi'}`,
  },
  palette: {
    placeholder: 'Cerca file, board e progetti — o digita un comando…',
    label: 'Palette dei comandi',
    results: 'Risultati',
    sections: {
      recent: 'Aperti di recente',
      create: 'Crea',
      goto: 'Vai a',
      files: 'File',
      boards: 'Board',
      projects: 'Progetti',
      workspace: 'Workspace',
      actions: 'Azioni',
    },
    noResults: (query) => `Nessun risultato per “${query}”`,
    driveScope:
      'La ricerca arriva a ciò che questo dispositivo contiene. Un progetto che vive solo nella cartella Drive di qualcun altro non è ancora stato letto qui.',
    createNamed: (kind, name) => `Crea ${kind} “${name}”`,
    inProject: (project) => `in ${project}`,
    currentProject: 'corrente',
    switchProject: 'cambia progetto',
    switchWorkspace: 'cambia workspace',
    commands: {
      graph: 'Apri la vista Grafo',
      split: 'Attiva/disattiva il layout diviso',
      toLight: 'Passa al tema chiaro',
      toDark: 'Passa al tema scuro',
      github: 'GitHub — sincronizza il codice',
      drive: 'Google Drive — connessione e diagnostica',
      share: 'Condivisione — membri e inviti',
      comments: 'Commenti',
      activity: 'Registro attività',
      versions: 'Cronologia versioni',
      shortcuts: 'Scorciatoie da tastiera',
      settings: 'Impostazioni',
      syncNow: 'Sincronizza ora (Google Drive)',
      goToSection: (section) => `Vai a ${section}`,
      modeHint: 'sezione',
    },
    viewModes: {
      board: 'Board',
      doc: 'Documento',
      sheet: 'Foglio',
      presentation: 'Presentazione',
      code: 'Codice',
      photo: 'Foto',
    },
  },
  create: {
    kinds: {
      project: 'progetto',
      board: 'board',
      doc: 'documento',
      note: 'nota Markdown',
      sheet: 'foglio di calcolo',
      present: 'presentazione',
      code: 'file di codice',
    },
    newLabel: (kind) => `Nuovo: ${kind}`,
    createIn: (project) => `Crea in ${project}`,
    chooseTarget: (kind) => `Dove va ${kind}?`,
    noProjects: 'Crea prima un progetto — ogni file vive dentro uno.',
    back: 'Indietro',
  },
  settings: {
    title: 'Impostazioni',
    open: 'Impostazioni',
    close: 'Chiudi le impostazioni',
    navLabel: 'Sezioni delle impostazioni',
    sections: {
      account: 'Account',
      profile: 'Profilo',
      appearance: 'Aspetto',
      notifications: 'Notifiche',
      security: 'Sicurezza',
      connections: 'App collegate',
      storage: 'Archiviazione e sync',
      billing: 'Piani e fatturazione',
      developer: 'Sviluppo',
    },
    intro: {
      account: 'Con quale identità hai fatto accesso, e come esci.',
      profile: 'Come appari alle persone con cui condividi.',
      appearance: 'Tema, contrasto, densità, dimensione, movimento e lingua.',
      notifications: 'Quali eventi ti raggiungono, e dove.',
      security: 'Sessioni, dispositivi e cosa protegge il vault.',
      connections: 'I servizi con cui Lattice parla, e cosa riceve ciascuno.',
      storage: 'Dove vive il tuo lavoro e se sta uscendo da questo browser.',
      billing: 'Quanto ti costa questa build.',
      developer: 'Informazioni di build e scorciatoie da tastiera.',
    },
    appearance: {
      system: 'Sistema',
      themeHint: 'Sistema segue il tuo sistema operativo, e continua a seguirlo.',
      contrast: 'Contrasto elevato',
      contrastHint:
        'Bordi più netti, testo secondario più chiaro e anello di focus più spesso. I colori restano gli stessi: cambia solo la distanza tra loro.',
      contrastNormal: 'Normale',
      contrastHigh: 'Elevato',
      density: 'Densità dell’interfaccia',
      densityHint:
        'Compatta stringe i controlli che si ripetono in ogni pannello. In entrambi i casi i target restano sopra i 24 px.',
      densityComfortable: 'Comoda',
      densityCompact: 'Compatta',
      size: 'Dimensione UI',
      sizeHint:
        'Scala l’interfaccia — pannelli, toolbar, finestre. La board mantiene il proprio zoom, così le card restano dove le hai messe.',
      sizeSmall: 'Piccola',
      sizeDefault: 'Predefinita',
      sizeLarge: 'Grande',
      motion: 'Movimento',
      motionHint:
        'Sistema rispetta già il “riduci movimento” del sistema operativo. Scegli Riduci per calmare l’app senza cambiare nulla fuori.',
      motionReduce: 'Riduci',
    },
    account: {
      emailLabel: 'E-mail principale',
      emailFromGoogle: 'Arriva dal tuo account Google e si cambia lì, non qui.',
      emailLocal:
        'Un segnaposto per l’account locale. Non ci viene mai inviato nulla — in questa build non esiste posta.',
      methods: 'Metodi di accesso',
      methodGoogle: 'Google',
      methodGithub: 'GitHub',
      methodLocal: 'Account locale',
      methodEmail: 'E-mail',
      idLabel: 'ID account',
      idHint: 'Resta lo stesso con qualunque metodo di accesso. Citalo in una segnalazione di bug.',
      created: 'Creato',
    },
    profile: {
      avatar: 'Avatar',
      avatarHint:
        'Compare su card, commenti e presenza. Viene ridimensionato e resta su questo dispositivo insieme al vault — non c’è altro posto dove metterlo.',
      upload: 'Carica un’immagine',
      remove: 'Rimuovi',
      displayName: 'Nome visualizzato',
      displayNameHint: 'Quello che le persone vedono su card, commenti e inviti.',
      providerSays: (name) => `Google dice “${name}”.`,
      reset: 'Usa quello',
      saved: 'Profilo aggiornato',
      usage: 'Come usi Lattice',
      usageHint:
        'Resta con il tuo account, così la risposta esiste prima che serva a qualcosa. Per ora nessuno la legge, e non esce da questo dispositivo.',
      usagePersonal: 'Personale',
      usageWork: 'Lavoro',
      usageEducation: 'Studio',
      languageAt: 'La lingua dell’interfaccia è una preferenza di visualizzazione: vive in Aspetto.',
      goAppearance: 'Apri Aspetto',
      avatarError: {
        'not-an-image': 'Quel file non è un’immagine.',
        'too-large': 'Immagine troppo grande — scegline una sotto gli 8 MB.',
        undecodable: 'Non è stato possibile leggere quell’immagine.',
      },
    },
    connections: {
      factsTitle: 'Identità, archiviazione e sincronizzazione',
      factsBody:
        'Tre risposte, non una. Aver fatto accesso con Google dice chi sei; una cartella collegata dice dove possono andare i file; una sincronizzazione attiva dice se ci stanno andando adesso.',
      identity: 'Identità',
      identityGoogle: (email) => `Accesso con Google come ${email}`,
      identityLocal: 'Un account locale — esiste solo in questo browser',
      identityNone: 'Nessun accesso. Tutto funziona lo stesso, e resta qui.',
      storage: 'Archiviazione',
      storageDrive: (folder) => `Il tuo Drive, nella cartella ${folder}`,
      storageLocal: 'Solo questo browser. Non è stato caricato niente.',
      sync: 'Sincronizzazione',
      syncOff: 'Non attiva — non c’è ancora dove sincronizzare',
      on: 'Attiva',
      offLabel: 'Non attiva',
      servicesTitle: 'Servizi',
      connect: 'Collega',
      disconnect: 'Scollega',
      states: {
        connected: 'Collegato',
        available: 'Non collegato',
        unconfigured: 'Non in questa build',
        blocked: 'Richiede l’accesso Google',
      },
      services: {
        drive: 'Google Drive',
        github: 'GitHub',
        realtime: 'Backend realtime',
        livekit: 'Chiamate LiveKit',
        conversion: 'Worker di conversione',
      },
      gets: {
        drive:
          'I file dei progetti che sincronizzi, in una cartella che puoi vedere. Lo scope è drive.file: Lattice legge solo ciò che ha creato, mai il resto del tuo Drive.',
        github:
          'Solo i documenti di codice, su un branch di lavoro che scegli tu. Note, board e tutto il resto non partono mai verso GitHub.',
        realtime:
          'Operazioni su board, modifiche a documenti e codice, presenza e cursori, mentre un progetto è aperto. Il tuo ruolo viene ricontrollato dal server a ogni operazione.',
        livekit:
          'Audio, videocamera e schermo mentre una chiamata è in corso. I flussi vanno a LiveKit, mai dentro il vault.',
        conversion:
          'Solo il file che chiedi di convertire, per il tempo della conversione.',
      },
      configuredBy: (variable) =>
        `Deciso quando è stata compilata questa build (${variable}): qui non c’è niente da attivare.`,
      blocked:
        'Configurato, ma autorizza tramite un account Google e non ce n’è uno collegato.',
    },
    security: {
      sessionTitle: 'Questa sessione',
      sessionBody:
        'Una sessione, in questo browser. Uscire rimuove l’account da questo dispositivo; il vault resta dov’è.',
      signedInGoogle: (email) => `Accesso con Google come ${email}`,
      signedInLocal: 'Un account locale, creato in questo browser',
      signedOut: 'Nessun accesso',
      revokeTitle: 'Revoca l’accesso a Drive',
      revokeBody:
        'Elimina il token Google e ne chiede la revoca a Google. Lattice perde subito l’accesso alla cartella; i file già lì restano nel tuo Drive, e il vault locale non viene toccato.',
      revoke: 'Revoca l’accesso',
      revokeUnavailable: 'Non c’è nessun token Drive da revocare.',
      protectionTitle: 'Cosa protegge il tuo lavoro',
      protectionVault:
        'Il vault vive in questo profilo del browser. Lattice non aggiunge cifratura propria: chi può aprire questo browser può aprire il vault — la cifratura a riposo è progettata, non realizzata.',
      protectionDrive:
        'I file replicati su Drive sono protetti dal tuo account Google, con il secondo fattore che già impone.',
      protectionServer:
        'Quando il realtime è configurato, è il server a verificare il tuo token Google e a emettere il ruolo: quello che il browser dichiara di essere non viene mai creduto.',
      guestTitle: 'Sessione ospite',
      guestBody:
        'Questo browser sta lavorando senza account. Tutto quello che crei resta in un vault ospite su questo dispositivo, e accedendo se lo porta con sé. Uscire dalla modalità ospite fa tornare la schermata di accesso: il vault resta, non viene cancellato.',
      exitGuest: 'Esci dalla modalità ospite',
      forgetTitle: 'Dimentica questo dispositivo',
      forgetBody:
        'Cancella questo vault da questo browser: i progetti, i corpi dei documenti e i binari degli asset in IndexedDB, i record di collaborazione, la contabilità di Drive e le chiavi GitHub e Gemini salvate qui. Quello che è già su Drive resta su Drive. Nient’altro su questa macchina viene toccato: il vault di un altro account non è di questa sessione da cancellare.',
      forget: 'Dimentica questo dispositivo',
      forgetConfirmTitle: 'Cancellare questo vault da questo browser?',
      forgetConfirmBody:
        'Da qui non si torna indietro. Quello che non è arrivato su Drive se ne va con lui.',
      // "Elimina" and not "Cancella": the dialog's other button reads "Cancel",
      // and in Italian the two look like the same word and mean the opposite
      forgetConfirm: 'Elimina',
      forgetBlocked: (n) =>
        `${n} database ${n === 1 ? 'è ancora aperto' : 'sono ancora aperti'} in un’altra scheda. Chiudi le altre schede e riprova.`,
    },
    notifications: {
      intro:
        'Le notifiche vengono ricavate su questo dispositivo da ciò che i tuoi progetti già dicono: quello che spegni qui non viene proprio sollevato.',
      event: 'Evento',
      inApp: 'In app',
      email: 'E-mail',
      events: {
        mentions: 'Menzioni',
        replies: 'Risposte',
        assignments: 'Assegnazioni',
        resolved: 'Commenti risolti',
        invites: 'Inviti',
        sync: 'Errori di sincronizzazione',
        jobs: 'Lavori in background',
        versions: 'Ripristini di versione',
      },
      eventHints: {
        mentions: 'Qualcuno scrive il tuo nome in un commento.',
        replies: 'Una risposta in un thread che hai aperto o a cui partecipi.',
        assignments: 'Un commento viene assegnato a te.',
        resolved: 'Un tuo commento viene risolto o riaperto.',
        invites: 'Vieni invitato a un progetto.',
        sync: 'Google Drive o la connessione realtime smettono di funzionare.',
        jobs: 'Sincronizzazione GitHub e conversione file riferiscono l’esito.',
        versions: 'Una versione viene ripristinata sopra il lavoro corrente.',
      },
      emailDisabled:
        'L’e-mail non ha ancora dove andare: in questa build non c’è un backend di posta, né un indirizzo verificato a cui scrivere. La fase 18 costruisce entrambi, e leggerà proprio questi interruttori.',
      noProducer:
        'Tre eventi previsti dal design non compaiono, perché per ora nessuno li solleva: le scadenze (nessuno sorveglia la data di scadenza di un commento), i cambi di ruolo (un ruolo cambia senza annunciarsi) e l’attività amministrativa (il registro attività è un registro, non una notifica). Un interruttore per loro non controllerebbe niente.',
    },
    pending: {
      profileSignedOut:
        'Un profilo ha bisogno di un account. Accedi dalla sezione Account, oppure continua senza — qui non è obbligatorio nulla.',
      security:
        'Sessioni attive, dispositivi e revoca compaiono qui quando le fasi 16 e 17 daranno loro qualcosa di reale da elencare.',
      billing:
        'Piani e fatturazione arrivano con la fase 22. In questa build nulla è misurato o addebitato.',
      accountMore:
        'Il tuo id non arriva più dal provider (16.1), ma non esiste ancora un secondo modo di accedere da collegare, e l’account non si può eliminare — l’accesso via e-mail arriva nella fase 17. Uscire lo toglie già da questo browser.',
      connectionsMore:
        'Il provider realtime, LiveKit e il backend di conversione entrano in questa lista nella 14.5.',
    },
    theme: 'Tema',
    themeDark: 'Scuro',
    themeLight: 'Chiaro',
    build: 'Build',
    shortcutsOpen: 'Apri il riepilogo delle scorciatoie',
    notSignedIn: 'Accesso non effettuato',
    notSignedInBody:
      'Lattice funziona senza account — tutto resta in questo browser. L’accesso con Google aggiunge la sincronizzazione con Drive e permette di recapitare gli inviti.',
  },

  textEntities: {
    notePurpose: 'Cattura rapida — markdown, link, nessuna formattazione da gestire.',
    documentPurpose: 'Scrittura formattata e strutturata, da finire e consegnare.',
    noNoteOpen: 'Nessuna nota aperta',
    newNote: 'Nuova nota',
    notesEmpty: 'Ancora niente catturato',
    promoteTitle: (title) => `Promuovere “${title}” a documento?`,
    promoteBody:
      'Testo, tag e wikilink passano in un nuovo documento che puoi formattare, ' +
      'strutturare ed esportare. La nota viene consumata, così lo stesso testo non ' +
      'esiste in due posti — le card che la puntano vengono rimosse.',
    promoteConfirm: 'Promuovi',
    promoted: 'Promossa a documento',
    promotedDetail: (title) => `“${title}” ora è un documento.`,
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
