import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Room, RoomEvent, Track } from 'livekit-client'
import { RoomContext } from '@livekit/components-react'
import { useStore } from '@/store/useStore'
import { useAccount } from '@/lib/auth/AccountProvider'
import { announce } from '@/lib/a11y/announcer'
import {
  fetchMediaGrant,
  mediaUnavailableMessage,
  mediaUnavailableReason,
  type MediaUnavailableReason,
} from '@/lib/media/mediaClient'
import type { MediaCapabilities } from '@/lib/media/mediaPermissions'
import type { CollabRole } from '@/types/collab'

/**
 * Project call session (LiveKit).
 *
 * Deliberate boundaries:
 *  - LiveKit carries ONLY audio, camera and screen share. CRDT content,
 *    presence, cursors, comments, roles and content permissions stay with
 *    Liveblocks/Yjs and are untouched by anything in here.
 *  - Presence ≠ call. Being in the project does not join the call; joining is
 *    always an explicit user action.
 *  - The microphone and the camera are OFF on join. `room.connect()` publishes
 *    nothing, so the browser never prompts for device permission until the
 *    user actually presses mic, camera or screen share.
 *  - Mounted once at the workspace shell, above the section switch, so moving
 *    between Board / Document / Sheet / Presentation / Code / Graph / Split
 *    never remounts the room or drops the call.
 */

export type CallStatus = 'idle' | 'connecting' | 'connected' | 'error'

interface CallContextValue {
  status: CallStatus
  error: string | null
  /** null while calls are available; a reason when the control must be disabled */
  unavailable: MediaUnavailableReason
  unavailableMessage: string
  room: Room | null
  role: CollabRole | null
  capabilities: MediaCapabilities | null
  micOn: boolean
  cameraOn: boolean
  screenOn: boolean
  join: () => Promise<void>
  leave: () => Promise<void>
  toggleMic: () => Promise<void>
  toggleCamera: () => Promise<void>
  toggleScreenShare: () => Promise<void>
}

const CallContext = createContext<CallContextValue | null>(null)

export function useCall(): CallContextValue {
  const ctx = useContext(CallContext)
  if (!ctx) throw new Error('useCall must be used inside <CallProvider>')
  return ctx
}

export function CallProvider({ children }: { children: React.ReactNode }) {
  const projectId = useStore((s) => s.activeProjectId)
  const { account } = useAccount()
  const [room] = useState(() => new Room({ adaptiveStream: true, dynacast: true }))
  const [status, setStatus] = useState<CallStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [role, setRole] = useState<CollabRole | null>(null)
  const [capabilities, setCapabilities] = useState<MediaCapabilities | null>(null)
  const [micOn, setMicOn] = useState(false)
  const [cameraOn, setCameraOn] = useState(false)
  const [screenOn, setScreenOn] = useState(false)
  const joiningRef = useRef(false)

  const unavailable = mediaUnavailableReason(!!account)
  const unavailableMessage = mediaUnavailableMessage(unavailable)

  /** Mirror the local publication state, including changes we did not initiate
   *  (e.g. the browser's own "Stop sharing" button ending a screen share). */
  const syncLocalState = useCallback(() => {
    const lp = room.localParticipant
    setMicOn(lp.isMicrophoneEnabled)
    setCameraOn(lp.isCameraEnabled)
    setScreenOn(lp.isScreenShareEnabled)
  }, [room])

  useEffect(() => {
    const onDisconnected = () => {
      setStatus('idle')
      setRole(null)
      setCapabilities(null)
      setMicOn(false)
      setCameraOn(false)
      setScreenOn(false)
      announce('You left the project call')
    }
    const onLocalPublished = () => syncLocalState()
    const onLocalUnpublished = () => syncLocalState()

    room
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.LocalTrackPublished, onLocalPublished)
      .on(RoomEvent.LocalTrackUnpublished, onLocalUnpublished)
      .on(RoomEvent.TrackMuted, syncLocalState)
      .on(RoomEvent.TrackUnmuted, syncLocalState)

    return () => {
      room
        .off(RoomEvent.Disconnected, onDisconnected)
        .off(RoomEvent.LocalTrackPublished, onLocalPublished)
        .off(RoomEvent.LocalTrackUnpublished, onLocalUnpublished)
        .off(RoomEvent.TrackMuted, syncLocalState)
        .off(RoomEvent.TrackUnmuted, syncLocalState)
    }
  }, [room, syncLocalState])

  const leave = useCallback(async () => {
    await room.disconnect()
  }, [room])

  // a call belongs to ONE project: switching project ends it rather than
  // silently keeping you in a room you can no longer see
  const previousProject = useRef(projectId)
  useEffect(() => {
    if (previousProject.current !== projectId) {
      previousProject.current = projectId
      if (room.state !== 'disconnected') void leave()
    }
  }, [projectId, room, leave])

  // disconnect on unmount so a hot reload or sign-out cannot leave a live room
  useEffect(() => {
    return () => {
      void room.disconnect()
    }
  }, [room])

  const join = useCallback(async () => {
    if (unavailable || joiningRef.current || room.state !== 'disconnected') return
    joiningRef.current = true
    setStatus('connecting')
    setError(null)
    try {
      const grant = await fetchMediaGrant(projectId)
      // connect only — no tracks are published, so no device prompt yet
      await room.connect(grant.url, grant.token)
      setRole(grant.role)
      setCapabilities(grant.capabilities)
      setStatus('connected')
      announce('You joined the project call. Microphone and camera are off.')
    } catch (e) {
      setStatus('error')
      setError(e instanceof Error ? e.message : 'Could not join the call.')
      announce('Could not join the project call')
    } finally {
      joiningRef.current = false
    }
  }, [projectId, room, unavailable])

  const guard = useCallback(
    async (allowed: boolean, action: () => Promise<unknown>, deniedLabel: string) => {
      if (status !== 'connected') return
      if (!allowed) {
        setError(`Your role cannot ${deniedLabel} in this call.`)
        return
      }
      try {
        await action()
        syncLocalState()
      } catch (e) {
        // most often: the user dismissed the browser permission prompt
        setError(e instanceof Error ? e.message : `Could not ${deniedLabel}.`)
        announce(`Could not ${deniedLabel}`)
        syncLocalState()
      }
    },
    [status, syncLocalState],
  )

  const toggleMic = useCallback(async () => {
    const next = !room.localParticipant.isMicrophoneEnabled
    await guard(
      !!capabilities?.audio,
      () => room.localParticipant.setMicrophoneEnabled(next),
      'use the microphone',
    )
    announce(next ? 'Microphone on' : 'Microphone muted')
  }, [room, capabilities, guard])

  const toggleCamera = useCallback(async () => {
    const next = !room.localParticipant.isCameraEnabled
    await guard(
      !!capabilities?.video,
      () => room.localParticipant.setCameraEnabled(next),
      'use the camera',
    )
    announce(next ? 'Camera on' : 'Camera off')
  }, [room, capabilities, guard])

  const toggleScreenShare = useCallback(async () => {
    const next = !room.localParticipant.isScreenShareEnabled
    await guard(
      !!capabilities?.screenShare,
      () => room.localParticipant.setScreenShareEnabled(next, { audio: true }),
      'share the screen',
    )
    announce(next ? 'Screen sharing started' : 'Screen sharing stopped')
  }, [room, capabilities, guard])

  const value = useMemo<CallContextValue>(
    () => ({
      status,
      error,
      unavailable,
      unavailableMessage,
      room: status === 'connected' ? room : null,
      role,
      capabilities,
      micOn,
      cameraOn,
      screenOn,
      join,
      leave,
      toggleMic,
      toggleCamera,
      toggleScreenShare,
    }),
    [
      status,
      error,
      unavailable,
      unavailableMessage,
      room,
      role,
      capabilities,
      micOn,
      cameraOn,
      screenOn,
      join,
      leave,
      toggleMic,
      toggleCamera,
      toggleScreenShare,
    ],
  )

  return (
    <CallContext.Provider value={value}>
      <RoomContext.Provider value={room}>{children}</RoomContext.Provider>
    </CallContext.Provider>
  )
}

/** Track sources the call UI renders. */
export const CALL_VIDEO_SOURCES = [Track.Source.Camera, Track.Source.ScreenShare] as const
