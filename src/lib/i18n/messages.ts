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
    /** whatever did not fit in the bar (12.3) */
    more: 'More controls',
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
      status: (n: number, total: number) =>
        `Slide ${n}/${total} · double-click text to edit · Del removes`,
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
   * the surface can be filled yet. `notBuilt` is deliberately not an empty
   * state: 13.3 rules that "nothing here" over a source that cannot answer is a
   * false negative, so this says the page is missing and claims nothing about
   * what it would contain.
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
    notBuilt: 'This destination is part of the dashboard, and its page is not built yet.',
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
      idLabel: 'Account ID',
      idHint: 'Quote this in a bug report.',
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
        'A second e-mail address cannot be linked, and the account cannot be deleted, until identity stops being whatever the provider says it is — phase 16. Signing out already removes it from this browser.',
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
    more: 'Altri controlli',
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
      status: (n, total) =>
        `Diapositiva ${n}/${total} · doppio clic sul testo per modificarlo · Canc elimina`,
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
    notBuilt: 'Questa destinazione fa parte della dashboard, e la sua pagina non è ancora costruita.',
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
      idLabel: 'ID account',
      idHint: 'Citalo in una segnalazione di bug.',
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
        'Non si può collegare una seconda e-mail, né eliminare l’account, finché l’identità resta quella che dice il provider — fase 16. Uscire lo toglie già da questo browser.',
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
