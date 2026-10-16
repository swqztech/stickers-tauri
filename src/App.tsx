import {
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

type StickerColor = 'lemon' | 'mint' | 'sky' | 'peach' | 'lilac' | 'sand'

type Sticker = {
  id: string
  title: string
  content: string
  color: StickerColor
  x: number
  y: number
  z: number
  w: number
  h: number
  createdAt: number
  updatedAt: number
  imageFile?: string
  imageDataUrl?: string
  folderId?: string
}

type StickerFolder = {
  id: string
  name: string
  createdAt: number
  order: number
  x: number
  y: number
  z: number
  parentId?: string
}

type ClipboardItem = {
  id: string
  kind: 'text' | 'image'
  text: string
  imageFile?: string
  imageDataUrl?: string
  fingerprint: string
  createdAt: number
}

type WorkspaceMeta = {
  id: string
  name: string
  createdAt: number
  stickerCount: number
  clipCount: number
  count: number
}

import type { WorkspaceSnapshot } from './desktopApi'

const COLORS: { id: StickerColor; label: string }[] = [
  { id: 'lemon', label: '柠檬' },
  { id: 'mint', label: '薄荷' },
  { id: 'sky', label: '天空' },
  { id: 'peach', label: '蜜桃' },
  { id: 'lilac', label: '淡紫' },
  { id: 'sand', label: '沙色' }
]

type DragState = {
  kind: 'sticker' | 'folder' | 'resize'
  id: string
  ox: number
  oy: number
  startX: number
  startY: number
  moved: boolean
  x?: number
  y?: number
  z?: number
  w?: number
  h?: number
  startW?: number
  startH?: number
}

const FOLDER_W = 168
const FOLDER_H = 128
const TAKEOUT_ZONE_H = 52
const DEFAULT_NOTE_W = 200
const DEFAULT_NOTE_H = 148
const MIN_NOTE_W = 140
const MIN_NOTE_H = 100
const MAX_NOTE_W = 720
const MAX_NOTE_H = 640
const MAX_FOLDERS = 48
const MAX_FOLDER_DEPTH = 8

function noteSize(sticker: { w?: number; h?: number }) {
  const w = Number.isFinite(Number(sticker.w)) ? Number(sticker.w) : DEFAULT_NOTE_W
  const h = Number.isFinite(Number(sticker.h)) ? Number(sticker.h) : DEFAULT_NOTE_H
  return {
    w: Math.min(MAX_NOTE_W, Math.max(MIN_NOTE_W, Math.round(w))),
    h: Math.min(MAX_NOTE_H, Math.max(MIN_NOTE_H, Math.round(h)))
  }
}

function previewText(text: string, max = 72) {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= max) return oneLine
  return `${oneLine.slice(0, max)}…`
}

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  return Boolean(el.closest('textarea, input, select, [contenteditable="true"]'))
}

async function fileToPngDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法读取图片')
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas.toDataURL('image/png')
}

export default function App() {
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [folders, setFolders] = useState<StickerFolder[]>([])
  /** null=桌面（文件夹+未入夹贴纸）；有值=进入该文件夹内部 */
  const [openFolderId, setOpenFolderId] = useState<string | null>(null)
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null>(null)
  const [overTakeout, setOverTakeout] = useState(false)
  const [alwaysOnTop, setAlwaysOnTop] = useState(true)
  const [ready, setReady] = useState(false)
  const [toast, setToastState] = useState<{ message: string; hasUndo: boolean } | null>(
    null
  )
  const toastTimerRef = useRef<number | null>(null)
  const toastUndoRef = useRef<(() => void) | null>(null)
  const [editing, setEditing] = useState<Sticker | null>(null)
  /** 本次编辑是否来自「新增」；取消时丢掉空贴纸 */
  const editingIsNewRef = useRef(false)
  const [draftContent, setDraftContent] = useState('')
  const [draftColor, setDraftColor] = useState<StickerColor>('lemon')
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [clipboardHistory, setClipboardHistory] = useState<ClipboardItem[]>([])
  const [clipboardSpaces, setClipboardSpaces] = useState<WorkspaceMeta[]>([])
  const [activeSpaceId, setActiveSpaceId] = useState('default')
  const [renamingSpace, setRenamingSpace] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null)
  const [folderRenameDraft, setFolderRenameDraft] = useState('')
  const [pendingDeleteId, setPendingDeleteId] = useState('')
  const [ctxMenu, setCtxMenu] = useState<{
    x: number
    y: number
    boardX: number
    boardY: number
  } | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const folderRenameRef = useRef<HTMLInputElement>(null)
  const skipSave = useRef(true)
  /** 切换空间时递增，作废未完成的自动保存，避免贴纸串到别的空间 */
  const saveGen = useRef(0)
  const activeSpaceIdRef = useRef('default')
  const foldersRef = useRef<StickerFolder[]>([])
  const openFolderIdRef = useRef<string | null>(null)
  const dragSpaceIdRef = useRef<string | null>(null)
  const suppressSpaceClickRef = useRef(false)
  const [dragOverSpaceId, setDragOverSpaceId] = useState<string | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const boardRef = useRef<HTMLDivElement>(null)

  function flushBoard(nextStickers: Sticker[], spaceId: string, nextFolders = foldersRef.current) {
    return window.api.saveBoard({
      stickers: nextStickers,
      folders: nextFolders,
      alwaysOnTop,
      spaceId
    })
  }

  function applyWorkspaceSnapshot(state: WorkspaceSnapshot, opts?: { skipStickers?: boolean }) {
    saveGen.current += 1
    skipSave.current = true
    activeSpaceIdRef.current = state.activeSpaceId
    setActiveSpaceId(state.activeSpaceId)
    setClipboardSpaces(
      Array.isArray(state.spaces) ? (state.spaces as WorkspaceMeta[]) : [],
    )
    if (Array.isArray(state.history))
      setClipboardHistory(state.history as ClipboardItem[])
    // 文件夹随空间走：即使为空也要覆盖，避免上个空间的文件夹残留
    if (!opts?.skipStickers) {
      const nextFolders = Array.isArray(state.folders)
        ? (state.folders as StickerFolder[]).map((f) => ({ ...f }))
        : []
      foldersRef.current = nextFolders
      setFolders(nextFolders)
      setStickers(
        Array.isArray(state.stickers)
          ? (state.stickers as Sticker[]).map((s) => ({ ...s }))
          : [],
      )
      setOpenFolderId(null)
      openFolderIdRef.current = null
    }
    if (typeof state.alwaysOnTop === 'boolean') setAlwaysOnTop(state.alwaysOnTop)
    window.setTimeout(() => {
      skipSave.current = false
    }, 80)
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const apiUp = await import('./desktopApi').then((m) => m.waitForApiReady())
        if (cancelled) return
        if (!apiUp) {
          setToast('贴纸服务未启动，请完全退出后重新打开应用')
          setReady(true)
          skipSave.current = false
          return
        }
        if (typeof window.api.getWorkspaceSnapshot === 'function') {
          const snap = await window.api.getWorkspaceSnapshot()
          if (cancelled) return
          applyWorkspaceSnapshot(snap)
        } else {
          const board = await window.api.loadBoard()
          if (cancelled) return
          setStickers(board.stickers)
          setAlwaysOnTop(board.alwaysOnTop)
        }
      } catch {
        const board = await window.api.loadBoard()
        if (cancelled) return
        setStickers(board.stickers)
        setAlwaysOnTop(board.alwaysOnTop)
      }
      if (!cancelled) {
        setReady(true)
        skipSave.current = false
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    foldersRef.current = folders
  }, [folders])

  useEffect(() => {
    // 拖动中不写盘，避免每帧 IPC；松手后再由状态变更触发保存
    if (!ready || skipSave.current || dragRef.current) return
    const gen = saveGen.current
    const spaceId = activeSpaceIdRef.current
    const timer = window.setTimeout(() => {
      if (skipSave.current || gen !== saveGen.current || dragRef.current) return
      if (spaceId !== activeSpaceIdRef.current) return
      void window.api.saveBoard({
        stickers,
        folders,
        alwaysOnTop,
        spaceId
      })
    }, 280)
    return () => window.clearTimeout(timer)
  }, [stickers, folders, alwaysOnTop, ready])

  /** 普通提示；传入 undo 时显示「撤销」，约 5 秒内可恢复 */
  function setToast(message: string, undo?: () => void) {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    if (!message) {
      toastUndoRef.current = null
      setToastState(null)
      return
    }
    toastUndoRef.current = undo || null
    setToastState({ message, hasUndo: Boolean(undo) })
    toastTimerRef.current = window.setTimeout(
      () => {
        toastUndoRef.current = null
        setToastState(null)
        toastTimerRef.current = null
      },
      undo ? 5200 : 2200
    )
  }

  function undoFromToast() {
    const undo = toastUndoRef.current
    toastUndoRef.current = null
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current)
      toastTimerRef.current = null
    }
    setToastState(null)
    if (!undo) return
    undo()
    setToast('已撤销')
  }

  useEffect(() => {
    let cancelled = false

    const unsubHistory =
      typeof window.api?.onClipboardHistory === 'function'
        ? window.api.onClipboardHistory((items) => {
            if (!cancelled) setClipboardHistory(Array.isArray(items) ? items : [])
          })
        : undefined

    const unsubSpaces =
      typeof window.api?.onClipboardSpaces === 'function'
        ? window.api.onClipboardSpaces((state) => {
            if (cancelled) return
            setClipboardSpaces(Array.isArray(state.spaces) ? state.spaces : [])
            setActiveSpaceId(state.activeSpaceId || 'default')
          })
        : undefined

    const unsubWorkspace =
      typeof window.api?.onWorkspaceChanged === 'function'
        ? window.api.onWorkspaceChanged((state) => {
            if (cancelled) return
            // 主进程已切空间时，整套（贴纸+文件夹+剪贴板）一起换，避免文件夹串空间
            if (state.activeSpaceId !== activeSpaceIdRef.current) {
              applyWorkspaceSnapshot(state)
              return
            }
            setClipboardSpaces(Array.isArray(state.spaces) ? state.spaces : [])
            if (Array.isArray(state.history)) setClipboardHistory(state.history)
          })
        : undefined

    return () => {
      cancelled = true
      unsubHistory?.()
      unsubSpaces?.()
      unsubWorkspace?.()
    }
  }, [])

  /** 直接子贴纸数 */
  const folderStickerCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of stickers) {
      if (s.folderId) map.set(s.folderId, (map.get(s.folderId) || 0) + 1)
    }
    return map
  }, [stickers])

  /** 直接子文件夹数 */
  const folderChildCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const f of folders) {
      if (f.parentId) map.set(f.parentId, (map.get(f.parentId) || 0) + 1)
    }
    return map
  }, [folders])

  /** 桌面：未入夹贴纸；文件夹内：该夹贴纸 */
  const visibleStickers = useMemo(() => {
    if (openFolderId) return stickers.filter((s) => s.folderId === openFolderId)
    return stickers.filter((s) => !s.folderId)
  }, [stickers, openFolderId])

  /** 当前桌面或当前文件夹里能看到的图片贴纸 */
  const visibleImageStickers = useMemo(
    () => visibleStickers.filter((s) => Boolean(s.imageDataUrl || s.imageFile)),
    [visibleStickers]
  )

  /** 当前层可见的文件夹（桌面或某文件夹内） */
  const visibleFolders = useMemo(() => {
    return folders
      .filter((f) =>
        openFolderId ? f.parentId === openFolderId : !f.parentId
      )
      .sort((a, b) => a.z - b.z)
  }, [folders, openFolderId])

  const sorted = useMemo(
    () => [...visibleStickers].sort((a, b) => a.z - b.z),
    [visibleStickers]
  )

  const openFolder = useMemo(
    () => (openFolderId ? folders.find((f) => f.id === openFolderId) || null : null),
    [folders, openFolderId]
  )

  /** 当前打开路径：桌面 → … → 当前夹 */
  const folderPath = useMemo(() => {
    if (!openFolderId) return [] as StickerFolder[]
    const path: StickerFolder[] = []
    const seen = new Set<string>()
    let cur = folders.find((f) => f.id === openFolderId)
    while (cur && !seen.has(cur.id)) {
      path.unshift(cur)
      seen.add(cur.id)
      cur = cur.parentId ? folders.find((f) => f.id === cur!.parentId) : undefined
    }
    return path
  }, [folders, openFolderId])

  function currentFolderIdForNew(): string | undefined {
    return openFolderId || undefined
  }

  function boardPoint(clientX: number, clientY: number) {
    const board = boardRef.current
    if (!board) return { x: clientX, y: clientY }
    const rect = board.getBoundingClientRect()
    return { x: clientX - rect.left + board.scrollLeft, y: clientY - rect.top + board.scrollTop }
  }

  function foldersAtCurrentLevel(exceptId?: string) {
    const parent = openFolderIdRef.current
    return foldersRef.current.filter((f) => {
      if (exceptId && f.id === exceptId) return false
      return parent ? f.parentId === parent : !f.parentId
    })
  }

  function findFolderAt(px: number, py: number, exceptId?: string) {
    const list = [...foldersAtCurrentLevel(exceptId)].sort((a, b) => b.z - a.z)
    for (const f of list) {
      if (px >= f.x && px <= f.x + FOLDER_W && py >= f.y && py <= f.y + FOLDER_H) {
        return f
      }
    }
    return null
  }

  function collectDescendantFolderIds(rootId: string) {
    const ids = new Set<string>([rootId])
    let grew = true
    while (grew) {
      grew = false
      for (const f of foldersRef.current) {
        if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
          ids.add(f.id)
          grew = true
        }
      }
    }
    return ids
  }

  function parentFolderIdOf(folderId: string | null | undefined) {
    if (!folderId) return undefined
    return foldersRef.current.find((f) => f.id === folderId)?.parentId
  }

  function folderDepthOf(parentId?: string) {
    if (!parentId) return 0
    let depth = 0
    let cur = foldersRef.current.find((f) => f.id === parentId)
    const seen = new Set<string>()
    while (cur && !seen.has(cur.id)) {
      depth += 1
      seen.add(cur.id)
      cur = cur.parentId
        ? foldersRef.current.find((f) => f.id === cur!.parentId)
        : undefined
    }
    return depth
  }

  /**
   * 在目标文件夹（或桌面）内计算下一个不重叠的落点。
   * 放入文件夹时若沿用桌面坐标，会全挤在文件夹图标附近。
   */
  function nextLayoutSlot(
    parentFolderId: string | undefined,
    opts?: {
      exceptStickerId?: string
      exceptFolderId?: string
      itemW?: number
      itemH?: number
      stickersOverride?: Sticker[]
      foldersOverride?: StickerFolder[]
    }
  ) {
    const itemW = opts?.itemW ?? DEFAULT_NOTE_W
    const itemH = opts?.itemH ?? DEFAULT_NOTE_H
    const gapX = 24
    const gapY = 24
    const padX = 36
    const padY = openFolderIdRef.current === parentFolderId ? 72 : 56
    const board = boardRef.current
    const boardW = board?.clientWidth || 1100
    const boardH = board?.clientHeight || 700
    const cols = Math.max(1, Math.floor((boardW - padX) / (itemW + gapX)))

    const stickersSrc = opts?.stickersOverride ?? stickers
    const foldersSrc = opts?.foldersOverride ?? foldersRef.current
    const occupied = [
      ...stickersSrc
        .filter(
          (s) =>
            (parentFolderId ? s.folderId === parentFolderId : !s.folderId) &&
            s.id !== opts?.exceptStickerId
        )
        .map((s) => ({ x: s.x, y: s.y, w: noteSize(s).w, h: noteSize(s).h })),
      ...foldersSrc
        .filter(
          (f) =>
            (parentFolderId ? f.parentId === parentFolderId : !f.parentId) &&
            f.id !== opts?.exceptFolderId
        )
        .map((f) => ({ x: f.x, y: f.y, w: FOLDER_W, h: FOLDER_H }))
    ]

    const overlaps = (x: number, y: number) =>
      occupied.some(
        (o) =>
          x < o.x + o.w + 8 &&
          x + itemW + 8 > o.x &&
          y < o.y + o.h + 8 &&
          y + itemH + 8 > o.y
      )

    const maxSlots = Math.max(48, occupied.length + 12)
    for (let i = 0; i < maxSlots; i++) {
      const col = i % cols
      const row = Math.floor(i / cols)
      const x = Math.min(
        Math.max(0, boardW - itemW),
        padX + col * (itemW + gapX)
      )
      const y = Math.min(
        Math.max(0, boardH - itemH),
        padY + row * (itemH + gapY)
      )
      if (!overlaps(x, y)) return { x, y }
    }

    // 兜底：网格末尾再错开一点
    const n = occupied.length
    return {
      x: Math.min(Math.max(0, boardW - itemW), padX + (n % cols) * 28),
      y: Math.min(Math.max(0, boardH - itemH), padY + Math.floor(n / cols) * 28)
    }
  }

  function bumpBoardZ() {
    const topS = Math.max(0, ...stickers.map((s) => s.z), 0)
    const topF = Math.max(0, ...foldersRef.current.map((f) => f.z), 0)
    return Math.max(topS, topF) + 1
  }

  function clearDragHighlights() {
    const board = boardRef.current
    if (!board) return
    board.classList.remove('takeout-hot')
    board.querySelector('.folder-rail')?.classList.remove('hot')
    board.querySelectorAll('.folder-card.drop-hot').forEach((el) => {
      el.classList.remove('drop-hot')
    })
    document.querySelectorAll('.space-tab.drop-hot').forEach((el) => {
      el.classList.remove('drop-hot')
    })
  }

  function hitSpaceTabAt(clientX: number, clientY: number): string | null {
    // 用几何命中：拖着的贴纸会盖住标签，elementFromPoint 不准
    const tabs = document.querySelectorAll('.space-tab[data-space-id]')
    for (const node of tabs) {
      const tab = node as HTMLElement
      if (tab.classList.contains('add')) continue
      const id = tab.dataset.spaceId
      if (!id || id === activeSpaceIdRef.current) continue
      const r = tab.getBoundingClientRect()
      if (
        clientX >= r.left &&
        clientX <= r.right &&
        clientY >= r.top &&
        clientY <= r.bottom
      ) {
        return id
      }
    }
    return null
  }

  function updateSpaceTabDropHighlight(clientX: number, clientY: number) {
    const hit = hitSpaceTabAt(clientX, clientY)
    document.querySelectorAll('.space-tab').forEach((el) => {
      const id = (el as HTMLElement).dataset.spaceId
      el.classList.toggle('drop-hot', Boolean(hit && id === hit))
    })
    return hit
  }

  function updateDragHighlights(clientX: number, clientY: number, exceptFolderId?: string) {
    const board = boardRef.current
    if (!board) return
    const spaceHit = updateSpaceTabDropHighlight(clientX, clientY)
    if (spaceHit) {
      board.classList.remove('takeout-hot')
      board.querySelector('.folder-rail')?.classList.remove('hot')
      board.querySelectorAll('.folder-card.drop-hot').forEach((el) => {
        el.classList.remove('drop-hot')
      })
      return
    }
    const pt = boardPoint(clientX, clientY)
    if (openFolderIdRef.current && pt.y <= TAKEOUT_ZONE_H) {
      board.classList.add('takeout-hot')
      board.querySelector('.folder-rail')?.classList.add('hot')
      board.querySelectorAll('.folder-card.drop-hot').forEach((el) => {
        el.classList.remove('drop-hot')
      })
      return
    }
    board.classList.remove('takeout-hot')
    board.querySelector('.folder-rail')?.classList.remove('hot')
    const drag = dragRef.current
    const except =
      exceptFolderId || (drag?.kind === 'folder' ? drag.id : undefined)
    const hit = findFolderAt(pt.x, pt.y, except)
    board.querySelectorAll('.folder-card').forEach((el) => {
      const id = (el as HTMLElement).dataset.id
      el.classList.toggle('drop-hot', Boolean(hit && id === hit.id))
    })
  }

  async function moveItemsToSpace(
    toSpaceId: string,
    opts: { stickerIds?: string[]; folderIds?: string[] },
    board?: { stickers: Sticker[]; folders: StickerFolder[] }
  ) {
    if (typeof window.api?.moveWorkspaceItems !== 'function') {
      setToast('请完全退出并重启贴纸板后再试')
      return
    }
    if (toSpaceId === activeSpaceIdRef.current) return
    const fromId = activeSpaceIdRef.current
    const boardStickers = board?.stickers ?? stickers
    const boardFolders = board?.folders ?? foldersRef.current
    try {
      saveGen.current += 1
      skipSave.current = true
      await flushBoard(boardStickers, fromId, boardFolders)
      const state = await window.api.moveWorkspaceItems({
        toSpaceId,
        fromSpaceId: fromId,
        stickerIds: opts.stickerIds,
        folderIds: opts.folderIds
      })
      applyWorkspaceSnapshot(state)
      const name =
        state.spaces.find((s) => s.id === toSpaceId)?.name || '目标空间'
      const folderN = opts.folderIds?.length || 0
      const stickerN = opts.stickerIds?.length || 0
      if (folderN && stickerN === 0) {
        setToast(`文件夹已移到「${name}」`)
      } else if (folderN) {
        setToast(`已移到「${name}」（含文件夹内贴纸）`)
      } else {
        setToast(`已移到「${name}」`)
      }
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
      skipSave.current = false
    }
  }

  function enterFolder(id: string) {
    setOpenFolderId(id)
    openFolderIdRef.current = id
    setDropTargetFolderId(null)
    setOverTakeout(false)
  }

  function leaveFolder() {
    setOpenFolderId(null)
    openFolderIdRef.current = null
    setOverTakeout(false)
  }

  /** 返回上一级：有父夹则进父夹，否则回桌面 */
  function goUpFolder() {
    const parentId = parentFolderIdOf(openFolderIdRef.current)
    if (parentId) enterFolder(parentId)
    else leaveFolder()
    setOverTakeout(false)
  }

  /** 把当前层贴纸/文件夹重新铺开，避免叠成一摞 */
  function tidyCurrentLevel() {
    const parentId = openFolderId || undefined
    const levelFolders = folders
      .filter((f) => (parentId ? f.parentId === parentId : !f.parentId))
      .sort((a, b) => a.z - b.z || a.createdAt - b.createdAt)
    const levelStickers = stickers
      .filter((s) => (parentId ? s.folderId === parentId : !s.folderId))
      .sort((a, b) => a.z - b.z || a.createdAt - b.createdAt)

    if (!levelFolders.length && !levelStickers.length) {
      setToast('当前没有可整理的内容')
      return
    }

    let nextFolders = [...folders]
    let nextStickers = [...stickers]
    for (const f of levelFolders) {
      const slot = nextLayoutSlot(parentId, {
        exceptFolderId: f.id,
        itemW: FOLDER_W,
        itemH: FOLDER_H,
        foldersOverride: nextFolders,
        stickersOverride: nextStickers
      })
      nextFolders = nextFolders.map((x) =>
        x.id === f.id ? { ...x, x: slot.x, y: slot.y } : x
      )
    }
    for (const s of levelStickers) {
      const size = noteSize(s)
      const slot = nextLayoutSlot(parentId, {
        exceptStickerId: s.id,
        itemW: size.w,
        itemH: size.h,
        foldersOverride: nextFolders,
        stickersOverride: nextStickers
      })
      nextStickers = nextStickers.map((x) =>
        x.id === s.id
          ? { ...x, x: slot.x, y: slot.y, updatedAt: Date.now() }
          : x
      )
    }
    foldersRef.current = nextFolders
    setFolders(nextFolders)
    setStickers(nextStickers)
    setToast('已重新排布')
  }

  async function onToggleTop() {
    const next = !alwaysOnTop
    setAlwaysOnTop(next)
    await window.api.setAlwaysOnTop(next)
  }

  async function onAdd() {
    const sticker = await window.api.createSticker({
      title: '',
      content: '',
      folderId: currentFolderIdForNew()
    })
    setStickers((prev) => [...prev, sticker])
    openEdit(sticker, { isNew: true })
  }

  function createFolder(at?: { x: number; y: number }) {
    if (folders.length >= MAX_FOLDERS) {
      setToast(`每个空间最多 ${MAX_FOLDERS} 个文件夹`)
      return
    }
    const parentId = openFolderId || undefined
    if (folderDepthOf(parentId) >= MAX_FOLDER_DEPTH) {
      setToast(`文件夹最多嵌套 ${MAX_FOLDER_DEPTH} 层`)
      return
    }
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    const siblings = folders.filter((f) =>
      parentId ? f.parentId === parentId : !f.parentId
    )
    const n = siblings.length
    const board = boardRef.current
    const maxX = Math.max(0, (board?.clientWidth || 1200) - FOLDER_W)
    const maxY = Math.max(0, (board?.clientHeight || 800) - FOLDER_H)
    const x = at
      ? Math.min(maxX, Math.max(0, at.x - FOLDER_W / 2))
      : 48 + (n % 4) * 180
    const y = at
      ? Math.min(maxY, Math.max(0, at.y - 24))
      : 56 + Math.floor(n / 4) * 140
    const folder: StickerFolder = {
      id,
      name: `文件夹 ${folders.length + 1}`,
      createdAt: Date.now(),
      order: n,
      x,
      y,
      z: bumpBoardZ(),
      parentId
    }
    const next = [...folders, folder]
    foldersRef.current = next
    setFolders(next)
    setRenamingFolderId(id)
    setFolderRenameDraft(folder.name)
    setToast(parentId ? '已在当前文件夹内新建' : '已创建文件夹，可再拖进别的文件夹')
    window.setTimeout(() => folderRenameRef.current?.select(), 40)
  }

  function beginRenameFolder(id: string) {
    const f = folders.find((x) => x.id === id)
    if (!f) return
    setRenamingFolderId(id)
    setFolderRenameDraft(f.name)
    window.setTimeout(() => folderRenameRef.current?.select(), 40)
  }

  function commitRenameFolder() {
    const id = renamingFolderId
    const name = folderRenameDraft.trim()
    setRenamingFolderId(null)
    if (!id || !name) return
    setFolders((prev) => {
      const next = prev.map((f) => (f.id === id ? { ...f, name: name.slice(0, 24) } : f))
      foldersRef.current = next
      return next
    })
    setToast(`文件夹已命名为「${name}」`)
  }

  function deleteFolder(id: string) {
    const f = folders.find((x) => x.id === id)
    if (!f) return
    // 只删这一层：子文件夹与贴纸上移到父级，保留更深层结构
    const folderSnap = { ...f }
    const childFolderIds = folders
      .filter((x) => x.parentId === id)
      .map((x) => x.id)
    const stickerIdsHere = stickers.filter((s) => s.folderId === id).map((s) => s.id)
    const riseTo = f.parentId
    const wasOpen = openFolderId === id
    const wasInside = Boolean(
      openFolderId && collectDescendantFolderIds(id).has(openFolderId)
    )

    setFolders((prev) => {
      const next = prev
        .filter((x) => x.id !== id)
        .map((x) => (x.parentId === id ? { ...x, parentId: riseTo } : x))
      foldersRef.current = next
      return next
    })
    setStickers((prev) =>
      prev.map((s) =>
        s.folderId === id ? { ...s, folderId: riseTo, updatedAt: Date.now() } : s
      )
    )
    if (wasOpen || wasInside) {
      if (riseTo) enterFolder(riseTo)
      else leaveFolder()
    }
    setToast(`已删除「${f.name}」`, () => {
      setFolders((prev) => {
        if (prev.some((x) => x.id === folderSnap.id)) return prev
        const next = prev
          .map((x) =>
            childFolderIds.includes(x.id) ? { ...x, parentId: folderSnap.id } : x
          )
          .concat([folderSnap])
        foldersRef.current = next
        return next
      })
      if (stickerIdsHere.length) {
        const idSet = new Set(stickerIdsHere)
        setStickers((prev) =>
          prev.map((s) =>
            idSet.has(s.id) ? { ...s, folderId: folderSnap.id, updatedAt: Date.now() } : s
          )
        )
      }
      if (wasOpen) enterFolder(folderSnap.id)
    })
  }

  function openImport() {
    setImportText('')
    setImportOpen(true)
  }

  function closeImport() {
    setImportOpen(false)
  }

  function onImport(e: FormEvent) {
    e.preventDefault()
    const lines = importText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (lines.length === 0) {
      setToast('没有可导入的内容（空行会忽略）')
      return
    }

    const now = Date.now()
    let z = Math.max(0, ...stickers.map((s) => s.z))
    const colorIds = COLORS.map((c) => c.id)

    const noteW = 200
    const noteH = 150
    const gapX = 36
    const gapY = 32
    const padX = 36
    const padY = 36
    const boardW = boardRef.current?.clientWidth || 1100
    const boardH = boardRef.current?.clientHeight || 700
    const cols = Math.max(1, Math.floor((boardW - padX * 2) / (noteW + gapX)))
    const rows = Math.max(1, Math.floor((boardH - padY * 2) / (noteH + gapY)))
    const capacity = Math.max(1, cols * rows)

    const folderId = currentFolderIdForNew()
    const imported: Sticker[] = lines.map((line, index) => {
      z += 1
      const slot = index % capacity
      const page = Math.floor(index / capacity)
      const col = slot % cols
      const row = Math.floor(slot / cols) % rows
      const jitterX = ((index * 17) % 21) - 10 + (page % 4) * 14
      const jitterY = ((index * 13) % 19) - 9 + Math.floor(page / 2) * 12
      const x = Math.min(Math.max(0, boardW - noteW), padX + col * (noteW + gapX) + jitterX)
      const y = Math.min(Math.max(0, boardH - noteH), padY + row * (noteH + gapY) + jitterY)
      return {
        id: `${now.toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`,
        title: '',
        content: line,
        color: colorIds[(stickers.length + index) % colorIds.length],
        x,
        y,
        z,
        w: DEFAULT_NOTE_W,
        h: DEFAULT_NOTE_H,
        createdAt: now + index,
        updatedAt: now + index,
        folderId
      }
    })

    setStickers((prev) => [...prev, ...imported])
    setToast(`已导入 ${imported.length} 张`)
    closeImport()
  }

  function openEdit(sticker: Sticker, opts?: { isNew?: boolean }) {
    if (sticker.imageDataUrl || sticker.imageFile) {
      setToast('图片贴纸不支持文本编辑')
      return
    }
    editingIsNewRef.current = Boolean(opts?.isNew)
    setEditing(sticker)
    setDraftContent(sticker.content || sticker.title || '')
    setDraftColor(sticker.color)
  }

  function closeEdit() {
    const id = editing?.id
    const discardNew = editingIsNewRef.current
    editingIsNewRef.current = false
    setEditing(null)
    if (discardNew && id) {
      setStickers((prev) => prev.filter((s) => s.id !== id))
    }
  }

  function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const content = draftContent.trim()
    if (!content) {
      setToast('内容不能为空')
      return
    }
    editingIsNewRef.current = false
    setStickers((prev) =>
      prev.map((s) =>
        s.id === editing.id
          ? { ...s, title: '', content, color: draftColor, updatedAt: Date.now() }
          : s
      )
    )
    setToast('已保存')
    closeEdit()
  }

  function removeSticker(id: string) {
    const snap = stickers.find((s) => s.id === id)
    if (!snap) return
    setStickers((prev) => prev.filter((s) => s.id !== id))
    if (editing?.id === id) {
      editingIsNewRef.current = false
      setEditing(null)
    }
    setToast('已删除贴纸', () => {
      setStickers((prev) => (prev.some((s) => s.id === snap.id) ? prev : [...prev, snap]))
    })
  }

  function withCurrentFolder(sticker: Sticker): Sticker {
    const folderId = currentFolderIdForNew()
    if (!folderId || sticker.folderId) return sticker
    return { ...sticker, folderId }
  }

  async function pasteCreateSticker() {
    setCtxMenu(null)
    const result = await window.api.createStickerFromClipboard()
    if (!result.ok || !result.sticker) {
      setToast('剪贴板是空的')
      return
    }
    setStickers((prev) => [...prev, withCurrentFolder(result.sticker as Sticker)])
    setToast(result.reason === 'image' ? '已创建图片贴纸' : '已创建贴纸')
  }

  async function pasteFromEvent(e: ReactClipboardEvent | ClipboardEvent) {
    const items = e.clipboardData?.items
    if (items) {
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          e.preventDefault()
          const dataUrl = await fileToPngDataUrl(file)
          const result = await window.api.createStickerFromImage(dataUrl)
          if (!result.ok || !result.sticker) {
            setToast('图片粘贴失败')
            return
          }
          setStickers((prev) => [...prev, withCurrentFolder(result.sticker as Sticker)])
          setToast('已创建图片贴纸')
          return
        }
      }
    }
    await pasteCreateSticker()
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'v') return
      if (isEditableTarget(e.target)) return
      if (editing || importOpen) return
      e.preventDefault()
      void pasteCreateSticker()
    }

    function onClick() {
      setCtxMenu(null)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('click', onClick)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('click', onClick)
    }
  }, [editing, importOpen])

  async function copyText(text: string) {
    const value = text.trim()
    if (!value) {
      setToast('没有可复制的内容')
      return
    }
    await window.api.writeClipboard(value)
    setToast('已复制')
  }

  async function copyClipboardItem(item: ClipboardItem) {
    await window.api.writeClipboardItem(item.id)
    setToast(item.kind === 'image' ? '已复制图片' : '已复制')
  }

  async function copySticker(sticker: Sticker) {
    if (sticker.imageDataUrl) {
      const history = await window.api.importClipboardImage(sticker.imageDataUrl)
      setClipboardHistory(history)
      setToast('已复制图片')
      return
    }
    await copyText(displayText(sticker))
  }

  async function saveStickerImage(sticker: Sticker) {
    if (!sticker.imageDataUrl && !sticker.imageFile) {
      setToast('这不是图片贴纸')
      return
    }
    if (typeof window.api?.saveStickerImage !== 'function') {
      setToast('请完全退出并重启贴纸板后再保存图片')
      return
    }
    try {
      const res = await window.api.saveStickerImage(sticker.id)
      if (!res.ok) {
        if (res.reason === 'cancel') return
        if (res.reason === 'not-image') setToast('这不是图片贴纸')
        else if (res.reason === 'missing') setToast('图片文件丢失')
        else setToast('保存失败')
        return
      }
      setToast('图片已保存到文件')
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    }
  }

  async function saveVisibleImages() {
    if (!visibleImageStickers.length) {
      setToast(openFolderId ? '当前文件夹没有图片贴纸' : '当前桌面没有图片贴纸')
      return
    }
    if (typeof window.api?.saveVisibleStickerImages !== 'function') {
      setToast('请完全退出并重启贴纸板后再试')
      return
    }
    try {
      const res = await window.api.saveVisibleStickerImages(
        visibleImageStickers.map((s) => s.id)
      )
      if (!res.ok) {
        if (res.reason === 'cancel') return
        if (res.reason === 'empty') {
          setToast(openFolderId ? '当前文件夹没有图片贴纸' : '当前桌面没有图片贴纸')
        } else setToast('保存失败')
        return
      }
      const skipHint = res.skipped > 0 ? `，跳过 ${res.skipped}` : ''
      setToast(`已保存 ${res.saved} 张图片${skipHint}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    }
  }

  async function importDroppedFiles(
    fileList: FileList | File[],
    opts: { folderId?: string; x?: number; y?: number }
  ) {
    const files = Array.from(fileList)
    if (!files.length) return

    const items: Array<{ path: string; folderId?: string; x?: number; y?: number }> =
      []
    const fallbackImages: File[] = []

    for (const file of files) {
      const path =
        typeof window.api.getPathForFile === 'function'
          ? window.api.getPathForFile(file)
          : ''
      if (path) {
        items.push({
          path,
          folderId: opts.folderId,
          x: opts.x,
          y: opts.y
        })
      } else if (file.type.startsWith('image/')) {
        fallbackImages.push(file)
      }
    }

    const created: Sticker[] = []
    if (items.length && typeof window.api.createStickersFromFiles === 'function') {
      const res = await window.api.createStickersFromFiles(items)
      if (Array.isArray(res.stickers)) created.push(...res.stickers)
    }

    for (const file of fallbackImages) {
      try {
        const dataUrl = await fileToPngDataUrl(file)
        const result = await window.api.createStickerFromImage(dataUrl, {
          folderId: opts.folderId,
          x: opts.x,
          y: opts.y
        })
        if (result.ok && result.sticker) created.push(result.sticker)
      } catch {
        // ignore
      }
    }

    if (!created.length) {
      setToast('没有可导入的文件')
      return
    }
    setStickers((prev) => [
      ...prev,
      ...created.map((s) =>
        opts.folderId ? { ...s, folderId: opts.folderId } : withCurrentFolder(s)
      )
    ])
    setToast(
      opts.folderId
        ? `已放入文件夹 · ${created.length} 张`
        : `已添加 ${created.length} 张贴纸`
    )
  }

  function onBoardDragOver(e: ReactDragEvent) {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  async function onBoardDrop(e: ReactDragEvent) {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    const pt = boardPoint(e.clientX, e.clientY)
    await importDroppedFiles(e.dataTransfer.files, {
      folderId: openFolderIdRef.current || undefined,
      x: Math.max(0, pt.x - 40),
      y: Math.max(0, pt.y - 40)
    })
  }

  function onFolderFileDragOver(e: ReactDragEvent) {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'copy'
  }

  async function onFolderFileDrop(e: ReactDragEvent, folderId: string) {
    if (![...e.dataTransfer.types].includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    await importDroppedFiles(e.dataTransfer.files, { folderId })
  }

  async function saveClipboardAsSticker(item: ClipboardItem) {
    const sticker = await window.api.createSticker({
      fromClipboardId: item.id,
      folderId: currentFolderIdForNew()
    })
    setStickers((prev) => [...prev, sticker])
    setToast(item.kind === 'image' ? '已存为图片贴纸' : '已存为贴纸')
  }

  async function removeClipboardItem(id: string) {
    const items = await window.api.removeClipboardItem(id)
    setClipboardHistory(Array.isArray(items) ? items : [])
  }

  async function clearClipboardHistory() {
    if (clipboardHistory.length === 0) return
    // Electron 下 confirm 常失效：连点两次
    if (pendingDeleteId !== '__clear_clip__') {
      setPendingDeleteId('__clear_clip__')
      setToast('再点一次「清空」以确认清空当前空间剪贴板')
      window.setTimeout(() => {
        setPendingDeleteId((id) => (id === '__clear_clip__' ? '' : id))
      }, 4000)
      return
    }
    setPendingDeleteId('')
    const items = await window.api.clearClipboardHistory()
    setClipboardHistory(Array.isArray(items) ? items : [])
    setToast('已清空当前空间剪贴板')
  }

  async function clearActiveWorkspace() {
    const empty =
      stickers.length === 0 && folders.length === 0 && clipboardHistory.length === 0
    if (empty) {
      setToast('当前空间已经是空的')
      return
    }
    if (typeof window.api?.clearWorkspace !== 'function') {
      setToast('请完全退出并重启贴纸板后再试')
      return
    }
    const key = `__clear_space__:${activeSpaceIdRef.current}`
    if (pendingDeleteId !== key) {
      setPendingDeleteId(key)
      setToast('再点一次「清空空间」以确认清空贴纸、文件夹和剪贴板')
      window.setTimeout(() => {
        setPendingDeleteId((id) => (id === key ? '' : id))
      }, 4000)
      return
    }
    setPendingDeleteId('')
    try {
      saveGen.current += 1
      skipSave.current = true
      const state = await window.api.clearWorkspace()
      applyWorkspaceSnapshot(state)
      setToast('已清空当前空间')
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    }
  }

  async function exportWorkspace() {
    if (stickers.length === 0 && clipboardHistory.length === 0) {
      setToast('当前空间是空的，没什么可导出')
      return
    }
    try {
      await flushBoard(stickers, activeSpaceIdRef.current)
      const res = await window.api.exportClipboardHistory(stickers)
      if (!res.ok) {
        if (res.reason === 'empty') setToast('当前空间是空的')
        else if (res.reason !== 'cancel') setToast('导出取消或失败')
        return
      }
      setToast(
        `已导出「${activeSpaceName}」：贴纸 ${res.stickerCount ?? 0} · 剪贴板 ${res.clipCount ?? 0}`
      )
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    }
  }

  async function importWorkspace() {
    try {
      await flushBoard(stickers, activeSpaceIdRef.current)
      const res = await window.api.importClipboardPack()
      if (!res.ok) {
        if (res.reason !== 'cancel') setToast('导入取消或失败')
        return
      }
      if (res.snapshot) {
        applyWorkspaceSnapshot(res.snapshot)
        setToast(
          res.reason === 'workspace'
            ? `已导入为新空间（贴纸+剪贴板共 ${res.added} 项）`
            : `已合并剪贴板：新增 ${res.added}，跳过 ${res.skipped}`
        )
        return
      }
      setClipboardHistory(
        Array.isArray(res.history) ? (res.history as ClipboardItem[]) : [],
      )
      setToast(`已导入：新增 ${res.added}`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    }
  }

  async function createWorkspace() {
    if (typeof window.api?.createClipboardSpace !== 'function') {
      setToast('请完全退出并重启贴纸板后再试')
      return
    }
    try {
      const fromId = activeSpaceIdRef.current
      const leavingFolders = foldersRef.current
      saveGen.current += 1
      skipSave.current = true
      await flushBoard(stickers, fromId, leavingFolders)
      const state = await window.api.createClipboardSpace(
        undefined,
        stickers,
        fromId,
        leavingFolders
      )
      applyWorkspaceSnapshot(state)
      const name =
        state.spaces.find((s) => s.id === state.activeSpaceId)?.name || '新空间'
      setToast(`已新建空空间「${name}」· 贴纸/文件夹/剪贴板均独立`)
      setRenamingSpace(true)
      setRenameDraft(name)
      window.setTimeout(() => renameInputRef.current?.select(), 40)
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    }
  }

  async function switchWorkspace(id: string) {
    if (id === activeSpaceId) return
    setRenamingSpace(false)
    try {
      const fromId = activeSpaceIdRef.current
      const leavingFolders = foldersRef.current
      saveGen.current += 1
      skipSave.current = true
      // 先把当前空间的贴纸+文件夹存回它自己，再加载目标空间独立数据
      await flushBoard(stickers, fromId, leavingFolders)
      const state = await window.api.switchClipboardSpace(
        id,
        stickers,
        fromId,
        leavingFolders
      )
      applyWorkspaceSnapshot(state)
      const name = state.spaces.find((s) => s.id === state.activeSpaceId)?.name || ''
      setToast(`已切换到「${name}」· 贴纸与文件夹已独立加载`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    }
  }

  function beginRenameSpace() {
    const current = clipboardSpaces.find((s) => s.id === activeSpaceId)
    if (!current) return
    setRenameDraft(current.name)
    setRenamingSpace(true)
    window.setTimeout(() => renameInputRef.current?.select(), 40)
  }

  async function commitRenameSpace() {
    const name = renameDraft.trim()
    setRenamingSpace(false)
    if (!name) return
    const current = clipboardSpaces.find((s) => s.id === activeSpaceId)
    if (current && current.name === name) return
    try {
      const state = await window.api.renameClipboardSpace(activeSpaceId, name)
      applyWorkspaceSnapshot(state, { skipStickers: true })
      setToast(`已命名为「${name}」`)
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    }
  }

  async function reorderSpaces(fromId: string, toId: string) {
    if (!fromId || !toId || fromId === toId) return
    const ids = clipboardSpaces.map((s) => s.id)
    const from = ids.indexOf(fromId)
    const to = ids.indexOf(toId)
    if (from < 0 || to < 0) return
    const next = [...ids]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    // 先本地更新，拖拽更跟手
    setClipboardSpaces((prev) => {
      const map = new Map(prev.map((s) => [s.id, s]))
      return next.map((id) => map.get(id)!).filter(Boolean)
    })
    try {
      const state = await window.api.reorderClipboardSpaces(next)
      applyWorkspaceSnapshot(state, { skipStickers: true })
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    }
  }

  async function moveActiveSpace(dir: -1 | 1) {
    const ids = clipboardSpaces.map((s) => s.id)
    const idx = ids.indexOf(activeSpaceId)
    if (idx < 0) return
    const target = idx + dir
    if (target < 0 || target >= ids.length) return
    await reorderSpaces(ids[idx], ids[target])
  }

  async function deleteActiveSpace() {
    if (clipboardSpaces.length <= 1) {
      setToast('至少保留一个空间')
      return
    }
    const current = clipboardSpaces.find((s) => s.id === activeSpaceId)
    if (!current) return
    if (pendingDeleteId !== current.id) {
      setPendingDeleteId(current.id)
      setToast(
        `再点一次「删除空间」以确认删除「${current.name}」（贴纸+剪贴板都会删）`
      )
      window.setTimeout(() => {
        setPendingDeleteId((id) => (id === current.id ? '' : id))
      }, 4000)
      return
    }
    setPendingDeleteId('')
    try {
      saveGen.current += 1
      skipSave.current = true
      const fromId = activeSpaceIdRef.current
      const leavingFolders = foldersRef.current
      await flushBoard(stickers, fromId, leavingFolders)
      const state = await window.api.deleteClipboardSpace(
        activeSpaceId,
        stickers,
        fromId,
        leavingFolders
      )
      applyWorkspaceSnapshot(state)
      setToast('已删除该空间')
    } catch (err) {
      setToast(err instanceof Error ? err.message : String(err))
    }
  }

  const activeSpaceName =
    clipboardSpaces.find((s) => s.id === activeSpaceId)?.name || '默认'

  function displayText(sticker: Sticker) {
    return sticker.content || sticker.title || ''
  }

  function onBoardContextMenu(e: ReactMouseEvent) {
    if (isEditableTarget(e.target)) return
    if ((e.target as HTMLElement).closest('.note, .folder-card, .folder-nav')) return
    e.preventDefault()
    const pt = boardPoint(e.clientX, e.clientY)
    setCtxMenu({ x: e.clientX, y: e.clientY, boardX: pt.x, boardY: pt.y })
  }

  function onStickerPointerDown(e: ReactPointerEvent, sticker: Sticker) {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const z = bumpBoardZ()
    const size = noteSize(sticker)
    const el = e.currentTarget as HTMLElement
    el.style.zIndex = String(z)
    el.classList.add('is-dragging')
    dragRef.current = {
      kind: 'sticker',
      id: sticker.id,
      ox: e.clientX - sticker.x,
      oy: e.clientY - sticker.y,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      x: sticker.x,
      y: sticker.y,
      w: size.w,
      h: size.h,
      z
    }
  }

  function onResizePointerDown(e: ReactPointerEvent, sticker: Sticker) {
    e.stopPropagation()
    e.preventDefault()
    const el = e.currentTarget.closest('.note') as HTMLElement | null
    if (!el) return
    el.setPointerCapture(e.pointerId)
    const size = noteSize(sticker)
    const z = bumpBoardZ()
    el.style.zIndex = String(z)
    el.classList.add('is-resizing')
    dragRef.current = {
      kind: 'resize',
      id: sticker.id,
      ox: 0,
      oy: 0,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      x: sticker.x,
      y: sticker.y,
      z,
      w: size.w,
      h: size.h,
      startW: size.w,
      startH: size.h
    }
  }

  function onFolderPointerDown(e: ReactPointerEvent, folder: StickerFolder) {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const z = bumpBoardZ()
    const el = e.currentTarget as HTMLElement
    el.style.zIndex = String(z)
    el.classList.add('is-dragging')
    dragRef.current = {
      kind: 'folder',
      id: folder.id,
      ox: e.clientX - folder.x,
      oy: e.clientY - folder.y,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      x: folder.x,
      y: folder.y,
      z
    }
  }

  function onBoardPointerMove(e: ReactPointerEvent) {
    const drag = dragRef.current
    const el =
      drag?.kind === 'resize'
        ? ((e.currentTarget as HTMLElement).closest('.note') as HTMLElement | null)
        : (e.currentTarget as HTMLElement)
    if (!drag || !el || drag.id !== el.dataset.id) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true

    if (drag.kind === 'resize') {
      const board = boardRef.current
      const maxW = Math.min(
        MAX_NOTE_W,
        Math.max(MIN_NOTE_W, (board?.clientWidth || 1200) - (drag.x || 0))
      )
      const maxH = Math.min(
        MAX_NOTE_H,
        Math.max(MIN_NOTE_H, (board?.clientHeight || 800) - (drag.y || 0))
      )
      const w = Math.min(
        maxW,
        Math.max(MIN_NOTE_W, Math.round((drag.startW || DEFAULT_NOTE_W) + dx))
      )
      const h = Math.min(
        maxH,
        Math.max(MIN_NOTE_H, Math.round((drag.startH || DEFAULT_NOTE_H) + dy))
      )
      drag.w = w
      drag.h = h
      el.style.width = `${w}px`
      el.style.height = `${h}px`
      return
    }

    const board = boardRef.current
    const itemW =
      drag.kind === 'folder' ? FOLDER_W : drag.w || DEFAULT_NOTE_W
    const itemH =
      drag.kind === 'folder' ? FOLDER_H : drag.h || DEFAULT_NOTE_H
    const maxX = Math.max(0, (board?.clientWidth || 1200) - itemW)
    const maxY = Math.max(0, (board?.clientHeight || 800) - itemH)
    const x = Math.min(maxX, Math.max(0, e.clientX - drag.ox))
    const y = Math.min(maxY, Math.max(0, e.clientY - drag.oy))
    drag.x = x
    drag.y = y
    // 直接改 DOM，避免拖动时整页 React 重渲染（图片贴纸尤其卡）
    el.style.left = `${x}px`
    el.style.top = `${y}px`

    if (drag.kind === 'sticker' || drag.kind === 'folder') {
      updateDragHighlights(e.clientX, e.clientY)
    }
  }

  function onResizePointerUp(e: ReactPointerEvent, sticker: Sticker) {
    const drag = dragRef.current
    dragRef.current = null
    const el =
      (e.currentTarget as HTMLElement).closest('.note') ||
      (e.currentTarget as HTMLElement)
    el.classList.remove('is-resizing')
    try {
      el.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    if (!drag || drag.kind !== 'resize' || drag.id !== sticker.id) return
    if (!drag.moved) return
    const size = noteSize({ w: drag.w, h: drag.h })
    const z = typeof drag.z === 'number' ? drag.z : sticker.z
    setStickers((prev) =>
      prev.map((s) =>
        s.id === sticker.id
          ? { ...s, w: size.w, h: size.h, z, updatedAt: Date.now() }
          : s
      )
    )
  }

  async function onStickerPointerUp(e: ReactPointerEvent, sticker: Sticker) {
    const drag = dragRef.current
    if (drag?.kind === 'resize') {
      onResizePointerUp(e, sticker)
      return
    }
    dragRef.current = null
    const spaceHit = hitSpaceTabAt(e.clientX, e.clientY)
    clearDragHighlights()
    setDropTargetFolderId(null)
    setOverTakeout(false)
    const el = e.currentTarget as HTMLElement
    el.classList.remove('is-dragging')
    try {
      el.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    if (!drag || drag.kind !== 'sticker') return

    if (drag.moved) {
      const x = typeof drag.x === 'number' ? drag.x : sticker.x
      const y = typeof drag.y === 'number' ? drag.y : sticker.y
      const z = typeof drag.z === 'number' ? drag.z : sticker.z
      const nextStickers = stickers.map((s) =>
        s.id === sticker.id ? { ...s, x, y, z, updatedAt: Date.now() } : s
      )

      if (spaceHit) {
        await moveItemsToSpace(
          spaceHit,
          { stickerIds: [sticker.id] },
          { stickers: nextStickers, folders: foldersRef.current }
        )
        return
      }

      const pt = boardPoint(e.clientX, e.clientY)
      // 当前层可拖入文件夹（桌面或文件夹内的子夹）
      const hit = findFolderAt(pt.x, pt.y)
      if (hit) {
        const size = noteSize(sticker)
        const slot = nextLayoutSlot(hit.id, {
          exceptStickerId: sticker.id,
          itemW: size.w,
          itemH: size.h,
          stickersOverride: nextStickers
        })
        setStickers(
          nextStickers.map((s) =>
            s.id === sticker.id
              ? {
                  ...s,
                  folderId: hit.id,
                  x: slot.x,
                  y: slot.y,
                  updatedAt: Date.now()
                }
              : s
          )
        )
        setToast(`已放入「${hit.name}」`)
        return
      }
      if (openFolderIdRef.current && pt.y <= TAKEOUT_ZONE_H) {
        const riseTo = parentFolderIdOf(openFolderIdRef.current)
        const size = noteSize(sticker)
        const slot = nextLayoutSlot(riseTo, {
          exceptStickerId: sticker.id,
          itemW: size.w,
          itemH: size.h,
          stickersOverride: nextStickers
        })
        setStickers(
          nextStickers.map((s) =>
            s.id === sticker.id
              ? {
                  ...s,
                  folderId: riseTo,
                  x: slot.x,
                  y: slot.y,
                  updatedAt: Date.now()
                }
              : s
          )
        )
        setToast(riseTo ? '已移到上一级' : '已取回桌面')
        return
      }
      setStickers(nextStickers)
      return
    }
    await copySticker(sticker)
  }

  async function onFolderPointerUp(e: ReactPointerEvent, folder: StickerFolder) {
    const drag = dragRef.current
    dragRef.current = null
    const spaceHit = hitSpaceTabAt(e.clientX, e.clientY)
    clearDragHighlights()
    setDropTargetFolderId(null)
    setOverTakeout(false)
    const el = e.currentTarget as HTMLElement
    el.classList.remove('is-dragging')
    try {
      el.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
    if (!drag || drag.kind !== 'folder') return
    if (!drag.moved) {
      enterFolder(folder.id)
      return
    }
    const x = typeof drag.x === 'number' ? drag.x : folder.x
    const y = typeof drag.y === 'number' ? drag.y : folder.y
    const z = typeof drag.z === 'number' ? drag.z : folder.z
    let nextFolders = foldersRef.current.map((f) =>
      f.id === folder.id ? { ...f, x, y, z } : f
    )

    if (spaceHit) {
      foldersRef.current = nextFolders
      if (openFolderId && collectDescendantFolderIds(folder.id).has(openFolderId)) {
        leaveFolder()
      }
      await moveItemsToSpace(
        spaceHit,
        { folderIds: [folder.id] },
        { stickers, folders: nextFolders }
      )
      return
    }

    const pt = boardPoint(e.clientX, e.clientY)
    if (openFolderIdRef.current && pt.y <= TAKEOUT_ZONE_H) {
      const riseTo = parentFolderIdOf(openFolderIdRef.current)
      const slot = nextLayoutSlot(riseTo, {
        exceptFolderId: folder.id,
        itemW: FOLDER_W,
        itemH: FOLDER_H,
        foldersOverride: nextFolders
      })
      nextFolders = nextFolders.map((f) =>
        f.id === folder.id
          ? { ...f, parentId: riseTo, x: slot.x, y: slot.y, z }
          : f
      )
      foldersRef.current = nextFolders
      setFolders(nextFolders)
      setToast(riseTo ? '文件夹已移到上一级' : '文件夹已取回桌面')
      return
    }

    const hit = findFolderAt(pt.x, pt.y, folder.id)
    if (hit) {
      const tree = collectDescendantFolderIds(folder.id)
      if (tree.has(hit.id)) {
        foldersRef.current = nextFolders
        setFolders(nextFolders)
        setToast('不能放入自己的子文件夹')
        return
      }
      if (folderDepthOf(hit.id) >= MAX_FOLDER_DEPTH) {
        foldersRef.current = nextFolders
        setFolders(nextFolders)
        setToast(`文件夹最多嵌套 ${MAX_FOLDER_DEPTH} 层`)
        return
      }
      const slot = nextLayoutSlot(hit.id, {
        exceptFolderId: folder.id,
        itemW: FOLDER_W,
        itemH: FOLDER_H,
        foldersOverride: nextFolders
      })
      nextFolders = nextFolders.map((f) =>
        f.id === folder.id
          ? { ...f, parentId: hit.id, x: slot.x, y: slot.y, z }
          : f
      )
      foldersRef.current = nextFolders
      setFolders(nextFolders)
      setToast(`已放入「${hit.name}」`)
      return
    }

    foldersRef.current = nextFolders
    setFolders(nextFolders)
  }

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar-main">
          <div>
            <p className="brand">贴纸板</p>
            <p className="sub">
              <button
                type="button"
                className="crumb link"
                onClick={() => leaveFolder()}
                title="回到桌面"
              >
                {activeSpaceName}
              </button>
              {folderPath.map((f, i) => (
                <span key={f.id} className="crumb-wrap">
                  <span className="crumb-sep">/</span>
                  {i === folderPath.length - 1 ? (
                    <span className="crumb accent">{f.name}</span>
                  ) : (
                    <button
                      type="button"
                      className="crumb link"
                      onClick={() => enterFolder(f.id)}
                    >
                      {f.name}
                    </button>
                  )}
                </span>
              ))}
            </p>
          </div>
          <div className="actions">
            <button
              type="button"
              className={alwaysOnTop ? 'is-on' : 'ghost'}
              onClick={() => void onToggleTop()}
            >
              {alwaysOnTop ? '已置顶' : '置顶'}
            </button>
            <button type="button" className="ghost" onClick={() => void exportWorkspace()}>
              导出
            </button>
            <button type="button" className="ghost" onClick={() => void importWorkspace()}>
              导入
            </button>
            <button type="button" className="ghost" onClick={openImport}>
              批量
            </button>
            <button
              type="button"
              className="ghost"
              disabled={visibleImageStickers.length === 0}
              onClick={() => void saveVisibleImages()}
              title={
                openFolderId
                  ? `保存当前文件夹内 ${visibleImageStickers.length} 张图片`
                  : `保存当前桌面 ${visibleImageStickers.length} 张图片`
              }
            >
              保存图片{visibleImageStickers.length > 0 ? ` ${visibleImageStickers.length}` : ''}
            </button>
            <button type="button" className="primary" onClick={() => void onAdd()}>
              新增贴纸
            </button>
          </div>
        </div>

        <div className="space-bar toolbar-spaces" aria-label="工作空间">
          <div className="space-tabs">
            {clipboardSpaces.map((space) => (
              <button
                key={space.id}
                type="button"
                draggable
                data-space-id={space.id}
                className={`space-tab ${space.id === activeSpaceId ? 'on' : ''} ${
                  dragOverSpaceId === space.id ? 'drag-over' : ''
                }`}
                onClick={() => {
                  if (suppressSpaceClickRef.current) {
                    suppressSpaceClickRef.current = false
                    return
                  }
                  void switchWorkspace(space.id)
                }}
                onDoubleClick={() => {
                  if (space.id === activeSpaceId) beginRenameSpace()
                }}
                onDragStart={(e) => {
                  dragSpaceIdRef.current = space.id
                  e.dataTransfer.effectAllowed = 'move'
                  e.dataTransfer.setData('text/plain', space.id)
                  try {
                    e.dataTransfer.setData('application/x-space-id', space.id)
                  } catch {
                    // ignore
                  }
                }}
                onDragEnd={() => {
                  dragSpaceIdRef.current = null
                  setDragOverSpaceId(null)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverSpaceId !== space.id) setDragOverSpaceId(space.id)
                }}
                onDragLeave={() => {
                  setDragOverSpaceId((cur) => (cur === space.id ? null : cur))
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragOverSpaceId(null)
                  const from =
                    e.dataTransfer.getData('application/x-space-id') ||
                    e.dataTransfer.getData('text/plain') ||
                    dragSpaceIdRef.current
                  if (!from || from === space.id) return
                  suppressSpaceClickRef.current = true
                  void reorderSpaces(from, space.id)
                }}
                title={`贴纸 ${space.stickerCount ?? 0} · 剪贴板 ${space.clipCount ?? space.count} · 拖标签排序 · 拖贴纸/文件夹到此可移入`}
              >
                <span>{space.name}</span>
                <em>
                  {(space.stickerCount ?? 0) + (space.clipCount ?? space.count)}
                </em>
              </button>
            ))}
            <button
              type="button"
              className="space-tab add"
              onClick={() => void createWorkspace()}
              title="新建空空间（空贴纸板 + 空文件夹 + 空剪贴板）"
            >
              + 新建空间
            </button>
          </div>
          <div className="space-ops">
            {renamingSpace ? (
              <form
                className="space-rename"
                onSubmit={(e) => {
                  e.preventDefault()
                  void commitRenameSpace()
                }}
              >
                <input
                  ref={renameInputRef}
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={() => void commitRenameSpace()}
                  maxLength={24}
                  placeholder="空间名称"
                  aria-label="空间名称"
                />
                <button type="submit">确定</button>
              </form>
            ) : (
              <div className="space-tools">
                <button
                  type="button"
                  className="tool"
                  disabled={
                    clipboardSpaces.findIndex((s) => s.id === activeSpaceId) <= 0
                  }
                  onClick={() => void moveActiveSpace(-1)}
                  title="左移"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="tool"
                  disabled={
                    clipboardSpaces.findIndex((s) => s.id === activeSpaceId) >=
                    clipboardSpaces.length - 1
                  }
                  onClick={() => void moveActiveSpace(1)}
                  title="右移"
                >
                  ›
                </button>
                <span className="tool-divider" />
                <button type="button" className="tool" onClick={() => beginRenameSpace()}>
                  重命名
                </button>
                <button
                  type="button"
                  className="tool danger"
                  onClick={() => void clearActiveWorkspace()}
                  title="清空当前空间的贴纸、文件夹和剪贴板（保留空间）"
                >
                  清空空间
                </button>
                <button
                  type="button"
                  className="tool danger"
                  disabled={clipboardSpaces.length <= 1}
                  onClick={() => void deleteActiveSpace()}
                  title="删除整个空间"
                >
                  删除
                </button>
              </div>
            )}
          </div>
        </div>

      </header>

      <div className="workspace">
        <div
          className={`board ${openFolderId ? 'in-folder' : ''} ${overTakeout ? 'takeout-hot' : ''}`}
          ref={boardRef}
          onContextMenu={onBoardContextMenu}
          onDragOver={onBoardDragOver}
          onDrop={(e) => void onBoardDrop(e)}
          onPaste={(e) => {
            if (isEditableTarget(e.target)) return
            e.preventDefault()
            void pasteFromEvent(e)
          }}
          tabIndex={0}
        >
          {openFolder && (
            <div className={`folder-rail ${overTakeout ? 'hot' : ''}`} data-no-drag>
              <button type="button" className="rail-back" onClick={() => goUpFolder()}>
                <span aria-hidden>←</span>
                {openFolder.parentId ? '上一级' : '桌面'}
              </button>
              <div className="rail-path">
                <div className="rail-crumbs">
                  <button type="button" className="rail-crumb" onClick={() => leaveFolder()}>
                    桌面
                  </button>
                  {folderPath.map((f, i) => (
                    <span key={f.id} className="rail-crumb-wrap">
                      <span className="rail-crumb-sep">/</span>
                      {i === folderPath.length - 1 ? (
                        renamingFolderId === f.id ? (
                          <form
                            className="folder-rename"
                            onSubmit={(e) => {
                              e.preventDefault()
                              commitRenameFolder()
                            }}
                          >
                            <input
                              ref={folderRenameRef}
                              value={folderRenameDraft}
                              onChange={(e) => setFolderRenameDraft(e.target.value)}
                              onBlur={() => commitRenameFolder()}
                              maxLength={24}
                              aria-label="文件夹名称"
                            />
                          </form>
                        ) : (
                          <button
                            type="button"
                            className="rail-title"
                            onDoubleClick={() => beginRenameFolder(f.id)}
                            title="双击重命名"
                          >
                            {f.name}
                          </button>
                        )
                      ) : (
                        <button
                          type="button"
                          className="rail-crumb"
                          onClick={() => enterFolder(f.id)}
                        >
                          {f.name}
                        </button>
                      )}
                    </span>
                  ))}
                </div>
                <p className="rail-hint">
                  {overTakeout
                    ? `松手即可移到${openFolder.parentId ? '上一级' : '桌面'}`
                    : `${visibleStickers.length} 张贴纸 · ${visibleFolders.length} 个子文件夹 · 拖到此处上移`}
                </p>
              </div>
              <div className="rail-actions">
                <button
                  type="button"
                  className="rail-save"
                  onClick={() => createFolder()}
                  title="在当前文件夹内新建子文件夹"
                >
                  新建夹
                </button>
                <button
                  type="button"
                  className="rail-save"
                  onClick={() => tidyCurrentLevel()}
                  title="把当前层贴纸/文件夹重新铺开"
                >
                  整理
                </button>
                {visibleImageStickers.length > 0 && (
                  <button
                    type="button"
                    className="rail-save"
                    onClick={() => void saveVisibleImages()}
                    title="保存本文件夹内全部图片"
                  >
                    保存图片 {visibleImageStickers.length}
                  </button>
                )}
                <button
                  type="button"
                  className="rail-danger"
                  onClick={() => deleteFolder(openFolder.id)}
                >
                  删除
                </button>
              </div>
            </div>
          )}

          {!ready && <p className="empty">加载中…</p>}
          {ready && !openFolderId && stickers.length === 0 && folders.length === 0 && (
            <p className="empty">
              桌面还是空的。右键新建，或把文件拖进来做成贴纸。
            </p>
          )}
          {ready &&
            openFolderId &&
            visibleStickers.length === 0 &&
            visibleFolders.length === 0 && (
              <p className="empty">
                文件夹是空的。可新建子文件夹，或把贴纸/文件拖进来。
              </p>
            )}
          {ready &&
            !openFolderId &&
            folders.length > 0 &&
            visibleStickers.length === 0 &&
            visibleFolders.length === 0 && (
              <p className="empty tip">内容都在更深层文件夹里了。打开文件夹继续浏览。</p>
            )}

          {visibleFolders.map((folder) => (
            <article
              key={folder.id}
              className={`folder-card ${dropTargetFolderId === folder.id ? 'drop-hot' : ''}`}
              data-id={folder.id}
              style={{ left: folder.x, top: folder.y, zIndex: folder.z }}
              onPointerDown={(e) => onFolderPointerDown(e, folder)}
              onPointerMove={onBoardPointerMove}
              onPointerUp={(e) => void onFolderPointerUp(e, folder)}
              onDragOver={onFolderFileDragOver}
              onDrop={(e) => void onFolderFileDrop(e, folder.id)}
              title="拖动移动 · 拖进其他文件夹可嵌套 · 拖到空间标签换空间 · 单击打开"
            >
              <div className="folder-icon" aria-hidden>
                <i />
              </div>
              {renamingFolderId === folder.id ? (
                <form
                  className="folder-rename on-card"
                  data-no-drag
                  onSubmit={(e) => {
                    e.preventDefault()
                    commitRenameFolder()
                  }}
                >
                  <input
                    ref={folderRenameRef}
                    value={folderRenameDraft}
                    onChange={(e) => setFolderRenameDraft(e.target.value)}
                    onBlur={() => commitRenameFolder()}
                    maxLength={24}
                    aria-label="文件夹名称"
                  />
                </form>
              ) : (
                <p className="folder-name">{folder.name}</p>
              )}
              <p className="folder-count">
                {folderStickerCounts.get(folder.id) || 0} 张贴纸
                {(folderChildCounts.get(folder.id) || 0) > 0
                  ? ` · ${folderChildCounts.get(folder.id)} 个子夹`
                  : ''}
              </p>
              <div className="folder-card-ops" data-no-drag>
                <button type="button" className="icon-btn" onClick={() => enterFolder(folder.id)}>
                  打开
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => beginRenameFolder(folder.id)}
                >
                  改名
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={() => deleteFolder(folder.id)}
                >
                  删除
                </button>
              </div>
            </article>
          ))}

          {sorted.map((sticker) => {
            const size = noteSize(sticker)
            return (
              <article
                key={sticker.id}
                className={`note color-${sticker.color}`}
                data-id={sticker.id}
                style={{
                  left: sticker.x,
                  top: sticker.y,
                  zIndex: sticker.z,
                  width: size.w,
                  height: size.h
                }}
                onPointerDown={(e) => onStickerPointerDown(e, sticker)}
                onPointerMove={onBoardPointerMove}
                onPointerUp={(e) => void onStickerPointerUp(e, sticker)}
                title={
                  openFolderId
                    ? '拖动换位置；右下角拖大小；拖到顶部取回桌面；拖到空间标签换空间；点击复制'
                    : '拖动换位置；右下角拖大小；拖到文件夹放入；拖到空间标签换空间；点击复制'
                }
              >
                {sticker.imageDataUrl ? (
                  <img
                    className="note-image"
                    src={sticker.imageDataUrl}
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <pre className="note-body">{displayText(sticker) || '（空）'}</pre>
                )}
                <div className="note-foot" data-no-drag>
                  <div className="note-ops">
                    {sticker.imageDataUrl || sticker.imageFile ? (
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => void saveStickerImage(sticker)}
                      >
                        保存
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => openEdit(sticker)}
                      >
                        编辑
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => removeSticker(sticker.id)}
                    >
                      删除
                    </button>
                  </div>
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => void copySticker(sticker)}
                  >
                    复制
                  </button>
                </div>
                <span
                  className="note-resize"
                  data-no-drag
                  title="拖动调整大小"
                  onPointerDown={(e) => onResizePointerDown(e, sticker)}
                />
              </article>
            )
          })}
        </div>

        <section className="clipboard-dock" aria-label="剪贴板历史">
          <div className="clipboard-head">
            <div>
              <p className="clipboard-label">剪贴板 · {activeSpaceName}</p>
              <p className="clipboard-meta">
                {clipboardHistory.length > 0
                  ? `${clipboardHistory.length} 条 · 与上方贴纸同属当前空间`
                  : '空 · 复制文本/图片后记入当前空间'}
              </p>
            </div>
            <div className="clipboard-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => void pasteCreateSticker()}
              >
                粘贴为贴纸
              </button>
              <button
                type="button"
                className="ghost"
                disabled={clipboardHistory.length === 0}
                onClick={() => void clearClipboardHistory()}
              >
                清空
              </button>
            </div>
          </div>

          {clipboardHistory.length === 0 ? (
            <p className="clipboard-empty">
              「{activeSpaceName}」的剪贴板是空的。切换空间可换另一套贴纸+剪贴板。
            </p>
          ) : (
            <div className="clipboard-list">
              {clipboardHistory.map((item, index) => (
                <article key={item.id} className={`clip-item ${index === 0 ? 'is-latest' : ''}`}>
                  {item.kind === 'image' ? (
                    <img
                      className="clip-image"
                      src={item.imageDataUrl}
                      alt="剪贴板图片"
                      draggable={false}
                    />
                  ) : (
                    <pre className="clip-text" title={item.text}>
                      {previewText(item.text)}
                    </pre>
                  )}
                  <div className="clip-actions">
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void saveClipboardAsSticker(item)}
                    >
                      贴纸
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => void removeClipboardItem(item.id)}
                    >
                      删
                    </button>
                    <button type="button" onClick={() => void copyClipboardItem(item)}>
                      复制
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {ctxMenu && (
        <div
          className="ctx-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e: ReactKeyboardEvent) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              createFolder({ x: ctxMenu.boardX, y: ctxMenu.boardY })
              setCtxMenu(null)
            }}
          >
            新建文件夹
            <span>{openFolderId ? '在当前夹' : '在此处'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              void onAdd()
              setCtxMenu(null)
            }}
          >
            新增贴纸
          </button>
          <button
            type="button"
            onClick={() => {
              void pasteCreateSticker()
            }}
          >
            粘贴创建贴纸
            <span>Ctrl+V</span>
          </button>
        </div>
      )}

      {toast && (
        <div className={`toast ${toast.hasUndo ? 'with-undo' : ''}`}>
          <span>{toast.message}</span>
          {toast.hasUndo && (
            <button type="button" className="toast-undo" onClick={undoFromToast}>
              撤销
            </button>
          )}
        </div>
      )}

      {editing && (
        <div className="modal-mask" onClick={closeEdit}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={saveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                closeEdit()
              }
            }}
          >
            <div className="modal-head">
              <h2>编辑内容</h2>
              <button type="button" className="modal-close" onClick={closeEdit} aria-label="关闭">
                ×
              </button>
            </div>
            <label>
              <span>内容（点击贴纸会复制）</span>
              <textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                onContextMenu={(e) => e.stopPropagation()}
                rows={8}
                placeholder="账号 / 密码 / 链接 / 文本…"
                autoFocus
              />
            </label>
            <div className="color-row">
              <span>底色</span>
              <div>
                {COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`swatch color-${c.id} ${draftColor === c.id ? 'is-active' : ''}`}
                    onClick={() => setDraftColor(c.id)}
                    aria-label={c.label}
                  />
                ))}
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={closeEdit}>
                取消
              </button>
              <button type="submit">保存</button>
            </div>
          </form>
        </div>
      )}

      {importOpen && (
        <div className="modal-mask" onClick={closeImport}>
          <form
            className="modal modal-import"
            onClick={(e) => e.stopPropagation()}
            onSubmit={onImport}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                closeImport()
              }
            }}
          >
            <div className="modal-head">
              <h2>批量贴纸</h2>
              <button type="button" className="modal-close" onClick={closeImport} aria-label="关闭">
                ×
              </button>
            </div>
            <p className="hint">一行一张贴纸，空行忽略。导入后点贴纸即可复制整行。</p>
            <label>
              <span>粘贴文本</span>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                onContextMenu={(e) => e.stopPropagation()}
                rows={12}
                placeholder={'user@a.com / pass1\nuser@b.com / pass2\nnpm run dev'}
                autoFocus
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={closeImport}>
                取消
              </button>
              <button type="submit">导入</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
