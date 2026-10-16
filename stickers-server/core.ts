import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  clipboard,
  nativeImage,
  Menu,
  dialog
} from 'electron'
import { basename, extname, join } from 'path'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync
} from 'fs'
import { createHash } from 'crypto'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import sharp from 'sharp'

export type StickerColor = 'lemon' | 'mint' | 'sky' | 'peach' | 'lilac' | 'sand'

export type Sticker = {
  id: string
  title: string
  content: string
  color: StickerColor
  x: number
  y: number
  z: number
  /** 贴纸宽度（可拖拽调整） */
  w: number
  /** 贴纸高度（可拖拽调整） */
  h: number
  createdAt: number
  updatedAt: number
  imageFile?: string
  /** 所属文件夹；空表示未分类 */
  folderId?: string
}

const DEFAULT_NOTE_W = 200
const DEFAULT_NOTE_H = 148
const MIN_NOTE_W = 140
const MIN_NOTE_H = 100
const MAX_NOTE_W = 720
const MAX_NOTE_H = 640

function clampNoteSize(w?: number, h?: number) {
  const width = Number.isFinite(Number(w)) ? Number(w) : DEFAULT_NOTE_W
  const height = Number.isFinite(Number(h)) ? Number(h) : DEFAULT_NOTE_H
  return {
    w: Math.min(MAX_NOTE_W, Math.max(MIN_NOTE_W, Math.round(width))),
    h: Math.min(MAX_NOTE_H, Math.max(MIN_NOTE_H, Math.round(height)))
  }
}

export type StickerFolder = {
  id: string
  name: string
  createdAt: number
  order: number
  /** 在画布上的位置（与贴纸一样可拖动） */
  x: number
  y: number
  z: number
  /** 父文件夹；空表示在桌面 */
  parentId?: string
}

export type BoardState = {
  stickers: Sticker[]
  alwaysOnTop: boolean
  folders?: StickerFolder[]
}

export type ClipboardKind = 'text' | 'image'

export type ClipboardItem = {
  id: string
  kind: ClipboardKind
  text: string
  imageFile?: string
  fingerprint: string
  createdAt: number
}

export type ClipboardItemView = ClipboardItem & {
  imageDataUrl?: string
}

/** 一个空间 = 贴纸板 + 剪贴板 一整套 */
export type Workspace = {
  id: string
  name: string
  createdAt: number
  stickers: Sticker[]
  clipboard: ClipboardItem[]
  folders: StickerFolder[]
}

const MAX_FOLDERS = 48

export type WorkspaceMeta = {
  id: string
  name: string
  createdAt: number
  stickerCount: number
  clipCount: number
}

/** @deprecated 兼容旧 preload 命名 */
export type ClipboardSpaceMeta = WorkspaceMeta & { count: number }

const COLORS: StickerColor[] = ['lemon', 'mint', 'sky', 'peach', 'lilac', 'sand']
const MAX_CLIPBOARD_HISTORY = 40
const MAX_WORKSPACES = 12

let mainWindow: BrowserWindow | null = null
let maxZ = 1
let lastFingerprint = ''
let clipboardTimer: ReturnType<typeof setInterval> | null = null
/** 当前激活空间的剪贴板（内存镜像） */
let clipboardHistory: ClipboardItem[] = []
let workspaces: Workspace[] = []
let activeSpaceId = 'default'
let alwaysOnTopFlag = true

function storePath() {
  return join(app.getPath('userData'), 'stickers.json')
}

function clipboardStorePath() {
  return join(app.getPath('userData'), 'clipboard-history.json')
}

function clipboardSpacesPath() {
  return join(app.getPath('userData'), 'clipboard-spaces.json')
}

function workspacesPath() {
  return join(app.getPath('userData'), 'workspaces.json')
}

function clipboardImageDir() {
  return join(app.getPath('userData'), 'clipboard-images')
}

function stickerImageDir() {
  return join(app.getPath('userData'), 'sticker-images')
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function defaultStickers(): Sticker[] {
  const now = Date.now()
  return [
    {
      id: 'demo-1',
      title: '',
      content: 'user@example.com\n密码：demo123',
      color: 'lemon',
      x: 48,
      y: 72,
      z: 1,
      w: DEFAULT_NOTE_W,
      h: DEFAULT_NOTE_H,
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'demo-2',
      title: '',
      content: 'npm run dev',
      color: 'mint',
      x: 300,
      y: 110,
      z: 2,
      w: DEFAULT_NOTE_W,
      h: DEFAULT_NOTE_H,
      createdAt: now,
      updatedAt: now
    }
  ]
}

function normalizeFolders(raw: unknown): StickerFolder[] {
  if (!Array.isArray(raw)) return []
  const list = raw
    .filter((f) => f && typeof f === 'object')
    .slice(0, MAX_FOLDERS)
    .map((f, i) => {
      const item = f as Partial<StickerFolder>
      const parentId = item.parentId ? String(item.parentId) : undefined
      return {
        id: String(item.id || uid()),
        name: String(item.name || `文件夹 ${i + 1}`).slice(0, 24),
        createdAt: Number(item.createdAt) || Date.now(),
        order: Number.isFinite(Number(item.order)) ? Number(item.order) : i,
        x: Number.isFinite(Number(item.x)) ? Number(item.x) : 48 + (i % 4) * 180,
        y: Number.isFinite(Number(item.y)) ? Number(item.y) : 56 + Math.floor(i / 4) * 140,
        z: Number.isFinite(Number(item.z)) ? Number(item.z) : i + 1,
        parentId
      }
    })
  const ids = new Set(list.map((f) => f.id))
  // 去掉无效/自指父级，避免坏数据成环
  for (const f of list) {
    if (f.parentId && (f.parentId === f.id || !ids.has(f.parentId))) {
      f.parentId = undefined
    }
  }
  return list.sort((a, b) => a.order - b.order || a.createdAt - b.createdAt)
}

/** 扩展文件夹 id 集合，包含全部子孙文件夹 */
function expandFolderSubtree(folders: StickerFolder[], rootIds: Set<string>) {
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (f.parentId && rootIds.has(f.parentId) && !rootIds.has(f.id)) {
        rootIds.add(f.id)
        grew = true
      }
    }
  }
  return rootIds
}

function normalizeStickers(raw: unknown): Sticker[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((s) => s && typeof s === 'object')
    .map((s) => {
      const item = s as Partial<Sticker> & { width?: number; height?: number }
      const size = clampNoteSize(item.w ?? item.width, item.h ?? item.height)
      return {
        id: String(item.id || uid()),
        title: String(item.title || ''),
        content: String(item.content || ''),
        color: (COLORS.includes(item.color as StickerColor)
          ? item.color
          : 'lemon') as StickerColor,
        x: Number(item.x) || 0,
        y: Number(item.y) || 0,
        z: Number(item.z) || 1,
        w: size.w,
        h: size.h,
        createdAt: Number(item.createdAt) || Date.now(),
        updatedAt: Number(item.updatedAt) || Date.now(),
        imageFile: item.imageFile ? String(item.imageFile) : undefined,
        folderId: item.folderId ? String(item.folderId) : undefined
      }
    })
}

function stickersView(list: Sticker[]) {
  return list.map((s) => ({
    ...s,
    imageDataUrl: stickerImageDataUrl(s.imageFile)
  }))
}

function activeWorkspace(): Workspace {
  let ws = workspaces.find((w) => w.id === activeSpaceId)
  if (!ws) {
    ws = workspaces[0]
    activeSpaceId = ws?.id || 'default'
  }
  if (!ws) {
    ws = {
      id: 'default',
      name: '默认',
      createdAt: Date.now(),
      stickers: defaultStickers(),
      clipboard: [],
      folders: []
    }
    workspaces = [ws]
    activeSpaceId = ws.id
  }
  if (!Array.isArray(ws.folders)) ws.folders = []
  return ws
}

function readState(): BoardState {
  syncActiveIntoWorkspaces()
  const ws = activeWorkspace()
  maxZ = Math.max(1, ...ws.stickers.map((s) => s.z || 1), 1)
  return {
    alwaysOnTop: alwaysOnTopFlag,
    stickers: ws.stickers,
    folders: ws.folders
  }
}

function writeState(state: BoardState, spaceId?: string) {
  alwaysOnTopFlag = Boolean(state.alwaysOnTop)
  const ws =
    (spaceId && workspaces.find((w) => w.id === spaceId)) || activeWorkspace()
  ws.stickers = normalizeStickers(state.stickers)
  if (Array.isArray(state.folders)) {
    ws.folders = normalizeFolders(state.folders)
  }
  if (ws.id === activeSpaceId) {
    maxZ = Math.max(1, ...ws.stickers.map((s) => s.z || 1), 1)
  }
  persistWorkspaces()
}

/** 把离开空间时的贴纸+文件夹写回该空间（按 id，不依赖当前 active） */
function commitSpaceBoard(
  spaceId: string,
  stickers?: Sticker[],
  folders?: StickerFolder[]
) {
  const ws = workspaces.find((w) => w.id === spaceId)
  if (!ws) return false
  if (Array.isArray(stickers)) ws.stickers = normalizeStickers(stickers)
  if (Array.isArray(folders)) ws.folders = normalizeFolders(folders)
  persistWorkspaces()
  return true
}

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function hashBuffer(buf: Buffer) {
  return createHash('sha1').update(buf).digest('hex')
}

function imagePathFor(fileName: string) {
  return join(clipboardImageDir(), fileName)
}

function toDataUrl(fileName?: string) {
  if (!fileName) return undefined
  const full = imagePathFor(fileName)
  if (!existsSync(full)) return undefined
  const buf = readFileSync(full)
  return `data:image/png;base64,${buf.toString('base64')}`
}

function toView(item: ClipboardItem): ClipboardItemView {
  if (item.kind !== 'image') return { ...item }
  return {
    ...item,
    imageDataUrl: toDataUrl(item.imageFile)
  }
}

function historyViews(): ClipboardItemView[] {
  return clipboardHistory.map(toView)
}

function normalizeItems(items: unknown): ClipboardItem[] {
  if (!Array.isArray(items)) return []
  const out: ClipboardItem[] = []
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue
    const item = raw as Partial<ClipboardItem>
    const kind = item.kind === 'image' ? 'image' : 'text'
    if (kind === 'image' && !item.imageFile) continue
    if (kind === 'text' && !String(item.text || '').trim()) continue
    out.push({
      id: String(item.id || uid()),
      kind,
      text: String(item.text || ''),
      imageFile: item.imageFile ? String(item.imageFile) : undefined,
      fingerprint: String(
        item.fingerprint ||
          (kind === 'image' ? `img:${item.imageFile}` : `text:${item.text}`)
      ),
      createdAt: Number(item.createdAt) || Date.now()
    })
    if (out.length >= MAX_CLIPBOARD_HISTORY) break
  }
  return out
}

function slimItems(items: ClipboardItem[]) {
  return items.map(({ id, kind, text, imageFile, fingerprint, createdAt }) => ({
    id,
    kind,
    text,
    imageFile,
    fingerprint,
    createdAt
  }))
}

function workspaceMetas(): ClipboardSpaceMeta[] {
  syncActiveIntoWorkspaces()
  return workspaces.map((w) => ({
    id: w.id,
    name: w.name,
    createdAt: w.createdAt,
    stickerCount: w.stickers.length,
    clipCount: w.id === activeSpaceId ? clipboardHistory.length : w.clipboard.length,
    count: w.id === activeSpaceId ? clipboardHistory.length : w.clipboard.length
  }))
}

function syncActiveIntoWorkspaces() {
  const ws = workspaces.find((w) => w.id === activeSpaceId)
  if (ws) ws.clipboard = clipboardHistory
}

function loadActiveFromWorkspaces() {
  const ws = activeWorkspace()
  clipboardHistory = [...ws.clipboard]
  maxZ = Math.max(1, ...ws.stickers.map((s) => s.z || 1), 1)
}

/** 切换空间后，避免立刻把当前系统剪贴板再记入新空间 */
function syncFingerprintToSystem() {
  const snap = readSystemSnapshot()
  lastFingerprint = snap?.fingerprint || ''
}

function persistWorkspaces() {
  ensureDir(app.getPath('userData'))
  syncActiveIntoWorkspaces()
  const payload = {
    version: 1,
    activeWorkspaceId: activeSpaceId,
    alwaysOnTop: alwaysOnTopFlag,
    workspaces: workspaces.map((w) => ({
      id: w.id,
      name: w.name,
      createdAt: w.createdAt,
      folders: normalizeFolders(w.folders),
      stickers: w.stickers,
      clipboard: slimItems(w.clipboard)
    }))
  }
  writeFileSync(workspacesPath(), JSON.stringify(payload, null, 2), 'utf8')
}

function readLegacyBoard(): { alwaysOnTop: boolean; stickers: Sticker[] } {
  const file = storePath()
  if (!existsSync(file)) {
    return { alwaysOnTop: true, stickers: defaultStickers() }
  }
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as BoardState
    if (!raw || !Array.isArray(raw.stickers)) {
      return { alwaysOnTop: true, stickers: defaultStickers() }
    }
    return {
      alwaysOnTop: Boolean(raw.alwaysOnTop),
      stickers: normalizeStickers(raw.stickers)
    }
  } catch {
    return { alwaysOnTop: true, stickers: defaultStickers() }
  }
}

function readLegacyClipboardHistory(): ClipboardItem[] {
  const file = clipboardStorePath()
  if (!existsSync(file)) return []
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { items?: unknown }
    return normalizeItems(raw.items)
  } catch {
    return []
  }
}

function workspaceSnapshot() {
  const ws = activeWorkspace()
  return {
    activeSpaceId,
    spaces: workspaceMetas(),
    history: historyViews(),
    stickers: stickersView(ws.stickers),
    folders: normalizeFolders(ws.folders),
    alwaysOnTop: alwaysOnTopFlag
  }
}

function loadWorkspaces() {
  const file = workspacesPath()
  if (existsSync(file)) {
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as {
        activeWorkspaceId?: string
        alwaysOnTop?: boolean
        workspaces?: Array<{
          id?: string
          name?: string
          createdAt?: number
          stickers?: unknown
          clipboard?: unknown
          folders?: unknown
        }>
      }
      if (Array.isArray(raw.workspaces) && raw.workspaces.length > 0) {
        alwaysOnTopFlag = raw.alwaysOnTop !== false
        workspaces = raw.workspaces.map((w, i) => ({
          id: String(w.id || `space-${i}`),
          name: String(w.name || `空间 ${i + 1}`).slice(0, 24),
          createdAt: Number(w.createdAt) || Date.now(),
          folders: normalizeFolders(w.folders),
          stickers: normalizeStickers(w.stickers),
          clipboard: normalizeItems(w.clipboard)
        }))
        activeSpaceId = String(raw.activeWorkspaceId || workspaces[0].id)
        loadActiveFromWorkspaces()
        return
      }
    } catch {
      // migrate
    }
  }

  // 从旧版 stickers.json + clipboard-spaces.json 迁移
  const board = readLegacyBoard()
  alwaysOnTopFlag = board.alwaysOnTop
  const spacesFile = clipboardSpacesPath()
  if (existsSync(spacesFile)) {
    try {
      const raw = JSON.parse(readFileSync(spacesFile, 'utf8')) as {
        activeSpaceId?: string
        spaces?: Array<{ id?: string; name?: string; createdAt?: number; items?: unknown }>
      }
      if (Array.isArray(raw.spaces) && raw.spaces.length > 0) {
        const activeId = String(raw.activeSpaceId || raw.spaces[0].id || 'default')
        workspaces = raw.spaces.map((s, i) => {
          const id = String(s.id || `space-${i}`)
          return {
            id,
            name: String(s.name || `空间 ${i + 1}`).slice(0, 24),
            createdAt: Number(s.createdAt) || Date.now(),
            folders: [],
            stickers: id === activeId ? board.stickers : [],
            clipboard: normalizeItems(s.items)
          }
        })
        activeSpaceId = activeId
        loadActiveFromWorkspaces()
        persistWorkspaces()
        return
      }
    } catch {
      // fall through
    }
  }

  const legacyClip = readLegacyClipboardHistory()
  workspaces = [
    {
      id: 'default',
      name: '默认',
      createdAt: Date.now(),
      folders: [],
      stickers: board.stickers,
      clipboard: legacyClip
    }
  ]
  activeSpaceId = 'default'
  clipboardHistory = [...legacyClip]
  persistWorkspaces()
}

function writeClipboardHistory(items: ClipboardItem[]) {
  clipboardHistory = items
  persistWorkspaces()
}

function deleteImageFile(fileName?: string) {
  if (!fileName) return
  const full = imagePathFor(fileName)
  if (existsSync(full)) {
    try {
      unlinkSync(full)
    } catch {
      // ignore
    }
  }
}

function imageStillUsed(fileName?: string, exceptIds?: Set<string>) {
  if (!fileName) return false
  syncActiveIntoWorkspaces()
  for (const space of workspaces) {
    for (const item of space.clipboard) {
      if (exceptIds?.has(item.id)) continue
      if (item.kind === 'image' && item.imageFile === fileName) return true
    }
  }
  return false
}

function pruneRemovedImages(removed: ClipboardItem[]) {
  for (const item of removed) {
    if (item.kind === 'image' && item.imageFile && !imageStillUsed(item.imageFile, new Set([item.id]))) {
      deleteImageFile(item.imageFile)
    }
  }
}

function applyAlwaysOnTop(enabled: boolean) {
  alwaysOnTopFlag = enabled
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setAlwaysOnTop(enabled, 'screen-saver')
}

function sendClipboardHistory() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('clipboard:history', historyViews())
  mainWindow.webContents.send('clipboard:spaces', {
    activeSpaceId,
    spaces: workspaceMetas()
  })
  mainWindow.webContents.send('workspace:changed', workspaceSnapshot())
}

function createClipboardSpace(name?: string) {
  if (workspaces.length >= MAX_WORKSPACES) {
    throw new Error(`最多 ${MAX_WORKSPACES} 个空间`)
  }
  syncActiveIntoWorkspaces()
  const n = workspaces.length + 1
  const space: Workspace = {
    id: uid(),
    name: (name?.trim() || `空间 ${n}`).slice(0, 24),
    createdAt: Date.now(),
    folders: [],
    stickers: [],
    clipboard: []
  }
  workspaces.push(space)
  activeSpaceId = space.id
  clipboardHistory = []
  maxZ = 1
  syncFingerprintToSystem()
  persistWorkspaces()
  sendClipboardHistory()
  return workspaceSnapshot()
}

function switchClipboardSpace(id: string) {
  const target = workspaces.find((s) => s.id === id)
  if (!target) throw new Error('空间不存在')
  if (id === activeSpaceId) {
    return workspaceSnapshot()
  }
  syncActiveIntoWorkspaces()
  activeSpaceId = id
  loadActiveFromWorkspaces()
  syncFingerprintToSystem()
  persistWorkspaces()
  sendClipboardHistory()
  return workspaceSnapshot()
}

function renameClipboardSpace(id: string, name: string) {
  const sp = workspaces.find((s) => s.id === id)
  if (!sp) throw new Error('空间不存在')
  const next = name.trim().slice(0, 24)
  if (!next) throw new Error('名称不能为空')
  sp.name = next
  persistWorkspaces()
  sendClipboardHistory()
  return workspaceSnapshot()
}

function deleteClipboardSpace(id: string) {
  if (workspaces.length <= 1) {
    throw new Error('至少保留一个空间')
  }
  const idx = workspaces.findIndex((s) => s.id === id)
  if (idx < 0) throw new Error('空间不存在')
  syncActiveIntoWorkspaces()
  const [removed] = workspaces.splice(idx, 1)
  pruneRemovedImages(removed.clipboard)
  for (const s of removed.stickers) {
    deleteStickerImageFile(s.imageFile)
  }
  if (activeSpaceId === id) {
    activeSpaceId = workspaces[Math.max(0, idx - 1)].id
    loadActiveFromWorkspaces()
    syncFingerprintToSystem()
  }
  persistWorkspaces()
  sendClipboardHistory()
  return workspaceSnapshot()
}

function deleteStickerImageFile(fileName?: string) {
  if (!fileName) return
  const full = join(stickerImageDir(), fileName)
  if (existsSync(full)) {
    try {
      unlinkSync(full)
    } catch {
      // ignore
    }
  }
}

/** 把贴纸/文件夹移到另一个空间（文件夹会连带其中的贴纸） */
function moveItemsToSpace(payload: {
  toSpaceId: string
  fromSpaceId?: string
  stickerIds?: string[]
  folderIds?: string[]
}) {
  const toId = String(payload.toSpaceId || '')
  const fromId = String(payload.fromSpaceId || activeSpaceId)
  const from = workspaces.find((w) => w.id === fromId)
  const to = workspaces.find((w) => w.id === toId)
  if (!from) throw new Error('源空间不存在')
  if (!to) throw new Error('目标空间不存在')
  if (from.id === to.id) throw new Error('已在该空间')

  const folderIds = expandFolderSubtree(
    from.folders,
    new Set((Array.isArray(payload.folderIds) ? payload.folderIds : []).map(String))
  )
  const stickerIds = new Set(
    (Array.isArray(payload.stickerIds) ? payload.stickerIds : []).map(String)
  )

  // 移动文件夹时，夹内（含子孙夹）贴纸一并带走
  for (const s of from.stickers) {
    if (s.folderId && folderIds.has(s.folderId)) stickerIds.add(s.id)
  }

  if (folderIds.size === 0 && stickerIds.size === 0) {
    throw new Error('没有可移动的内容')
  }

  const movingFolders = from.folders.filter((f) => folderIds.has(f.id))
  if (to.folders.length + movingFolders.length > MAX_FOLDERS) {
    throw new Error(`目标空间文件夹已满（最多 ${MAX_FOLDERS} 个）`)
  }

  const movingStickers = from.stickers.filter((s) => stickerIds.has(s.id))
  from.folders = from.folders.filter((f) => !folderIds.has(f.id))
  from.stickers = from.stickers.filter((s) => !stickerIds.has(s.id))

  let z =
    Math.max(
      0,
      ...to.stickers.map((s) => s.z || 0),
      ...to.folders.map((f) => f.z || 0)
    ) + 1
  const desktopCount =
    to.folders.filter((f) => !f.parentId).length +
    to.stickers.filter((s) => !s.folderId).length

  let rootIdx = 0
  for (const folder of movingFolders) {
    const keepParent = Boolean(folder.parentId && folderIds.has(folder.parentId))
    const isRoot = !keepParent
    const idx = desktopCount + rootIdx
    if (isRoot) rootIdx += 1
    to.folders.push({
      ...folder,
      parentId: keepParent ? folder.parentId : undefined,
      x: isRoot ? 48 + (idx % 4) * 180 : folder.x,
      y: isRoot ? 56 + Math.floor(idx / 4) * 140 : folder.y,
      z: z++,
      order: to.folders.length
    })
  }

  for (const [i, sticker] of movingStickers.entries()) {
    const keepFolder = Boolean(sticker.folderId && folderIds.has(sticker.folderId))
    const idx = desktopCount + rootIdx + i
    to.stickers.push({
      ...sticker,
      folderId: keepFolder ? sticker.folderId : undefined,
      // 单独移动的贴纸落到目标桌面；夹内贴纸保持相对坐标
      x: keepFolder ? sticker.x : 48 + (idx % 5) * 220,
      y: keepFolder ? sticker.y : 72 + Math.floor(idx / 5) * 170,
      z: z++,
      updatedAt: Date.now()
    })
  }

  if (from.id === activeSpaceId) {
    maxZ = Math.max(1, ...from.stickers.map((s) => s.z || 1), 1)
  }
  persistWorkspaces()
  sendClipboardHistory()
  return workspaceSnapshot()
}

/** 清空当前空间：贴纸、文件夹、剪贴板，保留空间本身 */
function clearActiveWorkspace() {
  syncActiveIntoWorkspaces()
  const ws = activeWorkspace()
  const removedClip = [...clipboardHistory]
  const removedStickers = [...ws.stickers]
  ws.stickers = []
  ws.folders = []
  clipboardHistory = []
  ws.clipboard = []
  pruneRemovedImages(removedClip)
  for (const s of removedStickers) {
    deleteStickerImageFile(s.imageFile)
  }
  maxZ = 1
  syncFingerprintToSystem()
  persistWorkspaces()
  sendClipboardHistory()
  return workspaceSnapshot()
}

/** 按 id 列表重排空间位置 */
function reorderClipboardSpaces(orderedIds: string[]) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new Error('无效的排序')
  }
  syncActiveIntoWorkspaces()
  const map = new Map(workspaces.map((w) => [w.id, w]))
  const next: Workspace[] = []
  for (const id of orderedIds) {
    const w = map.get(String(id))
    if (w) {
      next.push(w)
      map.delete(String(id))
    }
  }
  for (const w of map.values()) next.push(w)
  if (next.length !== workspaces.length) {
    throw new Error('排序结果不完整')
  }
  workspaces = next
  persistWorkspaces()
  sendClipboardHistory()
  return workspaceSnapshot()
}

function savePng(buffer: Buffer, id = uid()) {
  ensureDir(clipboardImageDir())
  const fileName = `${id}.png`
  writeFileSync(imagePathFor(fileName), buffer)
  return fileName
}

function rememberItem(item: Omit<ClipboardItem, 'id' | 'createdAt'> & { id?: string; createdAt?: number }) {
  const fingerprint = item.fingerprint
  if (!fingerprint) return clipboardHistory

  const existing = clipboardHistory.find((x) => x.fingerprint === fingerprint)
  if (existing) {
    clipboardHistory = [
      { ...existing, createdAt: Date.now() },
      ...clipboardHistory.filter((x) => x.id !== existing.id)
    ]
    lastFingerprint = fingerprint
    writeClipboardHistory(clipboardHistory)
    sendClipboardHistory()
    return clipboardHistory
  }

  const id = item.id || uid()
  const next: ClipboardItem = {
    id,
    kind: item.kind,
    text: item.text || '',
    imageFile: item.imageFile,
    fingerprint,
    createdAt: item.createdAt || Date.now()
  }

  const dropped = clipboardHistory.slice(MAX_CLIPBOARD_HISTORY - 1)
  clipboardHistory = [next, ...clipboardHistory].slice(0, MAX_CLIPBOARD_HISTORY)
  pruneRemovedImages(dropped.filter((d) => !clipboardHistory.some((h) => h.id === d.id)))
  lastFingerprint = fingerprint
  writeClipboardHistory(clipboardHistory)
  sendClipboardHistory()
  return clipboardHistory
}

function readSystemSnapshot(): { fingerprint: string; kind: ClipboardKind; text: string; png?: Buffer } | null {
  const image = clipboard.readImage()
  if (!image.isEmpty()) {
    const png = image.toPNG()
    if (png.length > 0) {
      return {
        kind: 'image',
        text: '',
        png: Buffer.from(png),
        fingerprint: `img:${hashBuffer(Buffer.from(png))}`
      }
    }
  }

  const text = clipboard.readText()
  if (text.trim()) {
    return {
      kind: 'text',
      text,
      fingerprint: `text:${text}`
    }
  }

  return null
}

function captureSystemClipboard(force = false) {
  const snap = readSystemSnapshot()
  if (!snap) {
    if (force) sendClipboardHistory()
    return { ok: false as const, reason: 'empty', history: historyViews() }
  }

  if (!force && snap.fingerprint === lastFingerprint) {
    return { ok: true as const, reason: 'same', history: historyViews() }
  }

  if (snap.kind === 'image' && snap.png) {
    const id = uid()
    const imageFile = savePng(snap.png, id)
    rememberItem({
      id,
      kind: 'image',
      text: '',
      imageFile,
      fingerprint: snap.fingerprint
    })
  } else {
    rememberItem({
      kind: 'text',
      text: snap.text,
      fingerprint: snap.fingerprint
    })
  }

  return { ok: true as const, reason: 'added', history: historyViews() }
}

function pollClipboard() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  captureSystemClipboard(false)
}

function startClipboardWatch() {
  if (clipboardTimer) return
  const snap = readSystemSnapshot()
  lastFingerprint = snap?.fingerprint || ''
  if (snap && clipboardHistory[0]?.fingerprint !== snap.fingerprint) {
    captureSystemClipboard(true)
  } else {
    sendClipboardHistory()
  }
  clipboardTimer = setInterval(() => pollClipboard(), 400)
}

function writeItemToClipboard(item: ClipboardItem) {
  if (item.kind === 'image' && item.imageFile) {
    const full = imagePathFor(item.imageFile)
    if (!existsSync(full)) throw new Error('图片文件不存在')
    clipboard.writeImage(nativeImage.createFromPath(full))
  } else {
    clipboard.writeText(item.text || '')
  }
  lastFingerprint = item.fingerprint
}

function copyImageFileToStickers(sourceFile?: string) {
  if (!sourceFile) return undefined
  const src = imagePathFor(sourceFile)
  if (!existsSync(src)) return undefined
  ensureDir(stickerImageDir())
  const fileName = `${uid()}.png`
  writeFileSync(join(stickerImageDir(), fileName), readFileSync(src))
  return fileName
}

function stickerImageDataUrl(fileName?: string) {
  if (!fileName) return undefined
  const full = join(stickerImageDir(), fileName)
  if (!existsSync(full)) {
    // 兼容：有些贴纸可能直接引用 clipboard-images
    return toDataUrl(fileName)
  }
  const buf = readFileSync(full)
  return `data:image/png;base64,${buf.toString('base64')}`
}

function createWindow(alwaysOnTop: boolean): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    title: '贴纸板',
    backgroundColor: '#2A3340',
    alwaysOnTop,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  if (alwaysOnTop) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
    sendClipboardHistory()
  })

  mainWindow.on('focus', () => {
    pollClipboard()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 输入框/文本域右键：剪切、复制、粘贴、全选
  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable && !params.selectionText) return

    const { editFlags } = params
    const items: Electron.MenuItemConstructorOptions[] = []

    if (params.isEditable) {
      items.push(
        { label: '撤销', role: 'undo', enabled: editFlags.canUndo },
        { label: '重做', role: 'redo', enabled: editFlags.canRedo },
        { type: 'separator' },
        { label: '剪切', role: 'cut', enabled: editFlags.canCut },
        { label: '复制', role: 'copy', enabled: editFlags.canCopy },
        { label: '粘贴', role: 'paste', enabled: editFlags.canPaste },
        { label: '删除', role: 'delete', enabled: editFlags.canDelete },
        { type: 'separator' },
        { label: '全选', role: 'selectAll', enabled: editFlags.canSelectAll }
      )
    } else {
      items.push({ label: '复制', role: 'copy' })
    }

    Menu.buildFromTemplate(items).popup({ window: mainWindow! })
  })

  // Tauri sidecar: no renderer window
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.codes.stickers')
  ensureDir(clipboardImageDir())
  ensureDir(stickerImageDir())

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  loadWorkspaces()
  const initial = readState()
  maxZ = Math.max(1, ...initial.stickers.map((s) => s.z || 1), 1)

  ipcMain.handle('board:load', () => {
    const state = readState()
    return {
      ...state,
      folders: normalizeFolders(state.folders),
      stickers: state.stickers.map((s) => ({
        ...s,
        imageDataUrl: stickerImageDataUrl(s.imageFile)
      }))
    }
  })

  ipcMain.handle(
    'board:save',
    (_e, state: BoardState & { spaceId?: string }) => {
      if (!state || !Array.isArray(state.stickers)) {
        throw new Error('无效的贴纸数据')
      }
      // 按 spaceId 写入对应空间；过期保存也写回旧空间，绝不串到当前空间
      const targetId = state.spaceId ? String(state.spaceId) : activeSpaceId
      if (state.spaceId && !workspaces.some((w) => w.id === targetId)) {
        return false
      }
      const target =
        workspaces.find((w) => w.id === targetId) || activeWorkspace()
      writeState(
        {
          alwaysOnTop: Boolean(state.alwaysOnTop),
          folders: Array.isArray(state.folders)
            ? normalizeFolders(state.folders)
            : target.folders,
          stickers: state.stickers.map((s) => {
            const size = clampNoteSize(s.w, s.h)
            return {
              id: s.id,
              title: s.title || '',
              content: s.content || '',
              color: s.color,
              x: s.x,
              y: s.y,
              z: s.z,
              w: size.w,
              h: size.h,
              createdAt: s.createdAt,
              updatedAt: s.updatedAt,
              imageFile: s.imageFile,
              folderId: s.folderId || undefined
            }
          })
        },
        targetId
      )
      applyAlwaysOnTop(Boolean(state.alwaysOnTop))
      return true
    }
  )

  ipcMain.handle('board:setAlwaysOnTop', (_e, enabled: boolean) => {
    applyAlwaysOnTop(Boolean(enabled))
    persistWorkspaces()
    return alwaysOnTopFlag
  })

  function appendSticker(payload?: Partial<Sticker> & { fromClipboardId?: string; png?: Buffer }) {
    const state = readState()
    maxZ += 1
    const now = Date.now()

    let imageFile = payload?.imageFile
    let content = payload?.content ?? ''

    if (payload?.fromClipboardId) {
      const clip = clipboardHistory.find((x) => x.id === payload.fromClipboardId)
      if (clip?.kind === 'image') {
        imageFile = copyImageFileToStickers(clip.imageFile)
        content = content || ''
      } else if (clip?.kind === 'text') {
        content = clip.text
      }
    }

    if (payload?.png && payload.png.length > 0) {
      ensureDir(stickerImageDir())
      const fileName = `${uid()}.png`
      writeFileSync(join(stickerImageDir(), fileName), payload.png)
      imageFile = fileName
      content = content || ''
    }

    const folderId = payload?.folderId ? String(payload.folderId) : undefined
    const size = clampNoteSize(payload?.w, payload?.h)
    const sticker: Sticker & { imageDataUrl?: string } = {
      id: uid(),
      title: payload?.title ? String(payload.title) : '',
      content,
      color: payload?.color && COLORS.includes(payload.color) ? payload.color : COLORS[state.stickers.length % COLORS.length],
      x: typeof payload?.x === 'number' ? payload.x : 48 + (state.stickers.length % 5) * 220,
      y: typeof payload?.y === 'number' ? payload.y : 72 + (state.stickers.length % 3) * 170,
      z: maxZ,
      w: size.w,
      h: size.h,
      createdAt: now,
      updatedAt: now,
      imageFile,
      folderId,
      imageDataUrl: stickerImageDataUrl(imageFile)
    }
    state.stickers.push({
      id: sticker.id,
      title: sticker.title,
      content: sticker.content,
      color: sticker.color,
      x: sticker.x,
      y: sticker.y,
      z: sticker.z,
      w: sticker.w,
      h: sticker.h,
      createdAt: sticker.createdAt,
      updatedAt: sticker.updatedAt,
      imageFile: sticker.imageFile,
      folderId: sticker.folderId
    })
    writeState({ ...state, folders: activeWorkspace().folders })
    return sticker
  }

  ipcMain.handle('sticker:create', (_e, payload?: Partial<Sticker> & { fromClipboardId?: string }) => {
    return appendSticker(payload)
  })

  // 从系统剪贴板创建贴纸（文本或图片），不依赖历史
  ipcMain.handle('sticker:fromClipboard', () => {
    const snap = readSystemSnapshot()
    if (!snap) {
      return { ok: false as const, reason: 'empty', sticker: null }
    }
    if (snap.kind === 'image' && snap.png) {
      const sticker = appendSticker({ png: snap.png, content: '' })
      return { ok: true as const, reason: 'image', sticker }
    }
    const text = snap.text.trim()
    if (!text) {
      return { ok: false as const, reason: 'empty', sticker: null }
    }
    const sticker = appendSticker({ content: text })
    return { ok: true as const, reason: 'text', sticker }
  })

  ipcMain.handle(
    'sticker:fromImageData',
    (
      _e,
      base64Png: string,
      meta?: { folderId?: string; x?: number; y?: number }
    ) => {
      const raw = String(base64Png || '').replace(/^data:image\/\w+;base64,/, '')
      const png = Buffer.from(raw, 'base64')
      if (!png.length) {
        return { ok: false as const, reason: 'invalid', sticker: null }
      }
      const sticker = appendSticker({
        png,
        content: '',
        folderId: meta?.folderId,
        x: meta?.x,
        y: meta?.y
      })
      return { ok: true as const, reason: 'image', sticker }
    }
  )

  function resolveStickerImagePath(imageFile: string) {
    const src = join(stickerImageDir(), imageFile)
    if (existsSync(src)) return src
    const alt = imagePathFor(imageFile)
    if (existsSync(alt)) return alt
    return null
  }

  function safeExportFileName(name: string, fallback: string) {
    const cleaned = String(name || '')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80)
    return cleaned || fallback
  }

  /** 把图片贴纸导出到用户选择的路径 */
  ipcMain.handle('sticker:saveImage', async (_e, stickerId: string, filePath?: string) => {
    syncActiveIntoWorkspaces()
    const sticker = activeWorkspace().stickers.find((s) => s.id === stickerId)
    if (!sticker?.imageFile) {
      return { ok: false as const, reason: 'not-image', path: null }
    }
    const src = resolveStickerImagePath(sticker.imageFile)
    if (!src) {
      return { ok: false as const, reason: 'missing', path: null }
    }
    const dest = filePath?.trim()
    if (!dest) {
      return { ok: false as const, reason: 'cancel', path: null }
    }
    copyFileSync(src, dest)
    return { ok: true as const, reason: 'saved', path: dest }
  })

  /** 批量保存指定贴纸中的图片到用户选择的文件夹 */
  ipcMain.handle('sticker:saveVisibleImages', async (_e, stickerIds: string[], dirPath?: string) => {
    syncActiveIntoWorkspaces()
    const idSet = new Set((Array.isArray(stickerIds) ? stickerIds : []).map(String))
    const images = activeWorkspace().stickers.filter(
      (s) => idSet.has(s.id) && s.imageFile
    )
    if (!images.length) {
      return {
        ok: false as const,
        reason: 'empty',
        dir: null as string | null,
        saved: 0,
        skipped: 0
      }
    }
    const dir = dirPath?.trim()
    if (!dir) {
      return {
        ok: false as const,
        reason: 'cancel',
        dir: null as string | null,
        saved: 0,
        skipped: 0
      }
    }
    const used = new Set<string>()
    let saved = 0
    let skipped = 0
    for (const [i, sticker] of images.entries()) {
      const src = resolveStickerImagePath(sticker.imageFile!)
      if (!src) {
        skipped += 1
        continue
      }
      const base = safeExportFileName(sticker.title || '', `贴纸-${i + 1}`)
      let fileName = `${base}.png`
      let n = 2
      while (
        used.has(fileName.toLowerCase()) ||
        existsSync(join(dir, fileName))
      ) {
        fileName = `${base}-${n}.png`
        n += 1
      }
      used.add(fileName.toLowerCase())
      copyFileSync(src, join(dir, fileName))
      saved += 1
    }
    if (saved > 0) {
      try {
        await shell.openPath(dir)
      } catch {
        // ignore
      }
    }
    return {
      ok: saved > 0,
      reason: saved > 0 ? 'saved' : 'none',
      dir,
      saved,
      skipped
    }
  })

  const IMAGE_EXTS = new Set([
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.ico',
    '.tif',
    '.tiff'
  ])
  const TEXT_EXTS = new Set([
    '.txt',
    '.md',
    '.json',
    '.csv',
    '.log',
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.css',
    '.html',
    '.xml',
    '.yml',
    '.yaml',
    '.ini',
    '.env'
  ])

  /** 从本地文件路径批量创建贴纸（拖放用） */
  ipcMain.handle(
    'sticker:fromFiles',
    async (
      _e,
      items: Array<{
        path: string
        folderId?: string
        x?: number
        y?: number
      }>
    ) => {
      if (!Array.isArray(items) || items.length === 0) {
        return { ok: false as const, reason: 'empty', stickers: [] as Sticker[] }
      }
      const created: Array<Sticker & { imageDataUrl?: string }> = []
      for (const [i, item] of items.entries()) {
        const filePath = String(item.path || '')
        if (!filePath || !existsSync(filePath)) continue
        const ext = extname(filePath).toLowerCase()
        const x =
          typeof item.x === 'number' ? item.x + (i % 4) * 24 : undefined
        const y =
          typeof item.y === 'number' ? item.y + Math.floor(i / 4) * 24 : undefined
        const folderId = item.folderId

        if (IMAGE_EXTS.has(ext)) {
          let png: Buffer
          try {
            png = await sharp(filePath, { failOn: 'none' }).rotate().png().toBuffer()
          } catch {
            continue
          }
          if (!png.length) continue
          created.push(
            appendSticker({
              png,
              content: '',
              title: basename(filePath),
              folderId,
              x,
              y
            }) as Sticker & {
              imageDataUrl?: string
            }
          )
          continue
        }

        if (TEXT_EXTS.has(ext)) {
          try {
            const text = readFileSync(filePath, 'utf8').slice(0, 24000)
            if (!text.trim()) continue
            created.push(
              appendSticker({
                content: text,
                title: basename(filePath),
                folderId,
                x,
                y
              }) as Sticker & { imageDataUrl?: string }
            )
          } catch {
            // ignore unreadable
          }
          continue
        }

        created.push(
          appendSticker({
            content: `${basename(filePath)}\n${filePath}`,
            title: basename(filePath),
            folderId,
            x,
            y
          }) as Sticker & { imageDataUrl?: string }
        )
      }
      return {
        ok: created.length > 0,
        reason: created.length ? 'added' : 'none',
        stickers: created
      }
    }
  )

  ipcMain.handle('clipboard:read', () => clipboard.readText())

  ipcMain.handle('clipboard:history', () => historyViews())

  ipcMain.handle('clipboard:spaces', () => ({
    activeSpaceId,
    spaces: workspaceMetas()
  }))

  ipcMain.handle('workspace:snapshot', () => workspaceSnapshot())

  ipcMain.handle('workspace:clear', () => clearActiveWorkspace())

  ipcMain.handle(
    'workspace:moveItems',
    (
      _e,
      payload: {
        toSpaceId: string
        fromSpaceId?: string
        stickerIds?: string[]
        folderIds?: string[]
      }
    ) => moveItemsToSpace(payload || { toSpaceId: '' })
  )

  ipcMain.handle(
    'clipboard:createSpace',
    (
      _e,
      name?: string,
      stickers?: Sticker[],
      fromSpaceId?: string,
      folders?: StickerFolder[]
    ) => {
      // 离开空间时同时写回贴纸+文件夹，保证每空间独立
      commitSpaceBoard(
        String(fromSpaceId || activeSpaceId),
        stickers,
        folders
      )
      return createClipboardSpace(name)
    }
  )

  ipcMain.handle(
    'clipboard:switchSpace',
    (
      _e,
      id: string,
      stickers?: Sticker[],
      fromSpaceId?: string,
      folders?: StickerFolder[]
    ) => {
      // 把贴纸+文件夹写回「离开的那个空间」，再加载目标空间自己的一套
      commitSpaceBoard(
        String(fromSpaceId || activeSpaceId),
        stickers,
        folders
      )
      return switchClipboardSpace(String(id || ''))
    }
  )

  ipcMain.handle('clipboard:renameSpace', (_e, id: string, name: string) => {
    return renameClipboardSpace(String(id || ''), String(name || ''))
  })

  ipcMain.handle('clipboard:reorderSpaces', (_e, orderedIds: string[]) => {
    return reorderClipboardSpaces(Array.isArray(orderedIds) ? orderedIds : [])
  })

  ipcMain.handle(
    'clipboard:deleteSpace',
    (
      _e,
      id: string,
      stickers?: Sticker[],
      fromSpaceId?: string,
      folders?: StickerFolder[]
    ) => {
      commitSpaceBoard(
        String(fromSpaceId || activeSpaceId),
        stickers,
        folders
      )
      return deleteClipboardSpace(String(id || ''))
    }
  )

  ipcMain.handle('clipboard:capture', () => captureSystemClipboard(true))

  ipcMain.handle('clipboard:remove', (_e, id: string) => {
    const removed = clipboardHistory.filter((item) => item.id === id)
    clipboardHistory = clipboardHistory.filter((item) => item.id !== id)
    pruneRemovedImages(removed)
    writeClipboardHistory(clipboardHistory)
    sendClipboardHistory()
    return historyViews()
  })

  ipcMain.handle('clipboard:clear', () => {
    const removed = clipboardHistory
    clipboardHistory = []
    pruneRemovedImages(removed)
    writeClipboardHistory(clipboardHistory)
    sendClipboardHistory()
    return historyViews()
  })

  ipcMain.handle('clipboard:write', (_e, text: string) => {
    const value = String(text ?? '')
    clipboard.writeText(value)
    if (value.trim()) {
      rememberItem({
        kind: 'text',
        text: value,
        fingerprint: `text:${value}`
      })
    }
    return true
  })

  ipcMain.handle('clipboard:writeItem', (_e, id: string) => {
    const item = clipboardHistory.find((x) => x.id === id)
    if (!item) throw new Error('历史项不存在')
    writeItemToClipboard(item)
    // 提到最前
    rememberItem(item)
    return true
  })

  ipcMain.handle('clipboard:importImage', (_e, base64Png: string) => {
    const raw = String(base64Png || '').replace(/^data:image\/\w+;base64,/, '')
    const png = Buffer.from(raw, 'base64')
    if (!png.length) throw new Error('无效图片')
    const fingerprint = `img:${hashBuffer(png)}`
    const id = uid()
    const imageFile = savePng(png, id)
    rememberItem({
      id,
      kind: 'image',
      text: '',
      imageFile,
      fingerprint
    })
    // 同步写回系统剪贴板，方便继续粘贴
    clipboard.writeImage(nativeImage.createFromBuffer(png))
    lastFingerprint = fingerprint
    return historyViews()
  })

  /** 导出当前空间（贴纸板 + 剪贴板，图片内嵌 base64） */
  ipcMain.handle('clipboard:export', async (_e, stickers?: Sticker[], filePath?: string) => {
    if (Array.isArray(stickers)) {
      activeWorkspace().stickers = normalizeStickers(stickers)
      persistWorkspaces()
    }
    syncActiveIntoWorkspaces()
    const ws = activeWorkspace()
    if (ws.stickers.length === 0 && clipboardHistory.length === 0) {
      return {
        ok: false as const,
        reason: 'empty',
        path: null,
        count: 0,
        stickerCount: 0,
        clipCount: 0
      }
    }

    const clipItems = clipboardHistory.map((item) => {
      if (item.kind === 'image' && item.imageFile) {
        const full = imagePathFor(item.imageFile)
        const imageBase64 = existsSync(full)
          ? readFileSync(full).toString('base64')
          : ''
        return {
          kind: 'image' as const,
          text: item.text || '',
          imageBase64,
          fingerprint: item.fingerprint,
          createdAt: item.createdAt
        }
      }
      return {
        kind: 'text' as const,
        text: item.text || '',
        fingerprint: item.fingerprint,
        createdAt: item.createdAt
      }
    })

    const stickerItems = ws.stickers.map((s) => {
      let imageBase64: string | undefined
      if (s.imageFile) {
        const full = join(stickerImageDir(), s.imageFile)
        if (existsSync(full)) imageBase64 = readFileSync(full).toString('base64')
        else {
          const clipFull = imagePathFor(s.imageFile)
          if (existsSync(clipFull)) imageBase64 = readFileSync(clipFull).toString('base64')
        }
      }
      return {
        title: s.title,
        content: s.content,
        color: s.color,
        x: s.x,
        y: s.y,
        z: s.z,
        w: s.w,
        h: s.h,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        folderId: s.folderId,
        imageBase64
      }
    })

    const pack = {
      format: 'stickers-workspace',
      version: 1,
      spaceName: ws.name,
      exportedAt: Date.now(),
      folders: normalizeFolders(ws.folders),
      stickers: stickerItems,
      clipboard: clipItems
    }

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const safeName = ws.name.replace(/[\\/:*?"<>|]/g, '_')
    const chosen = filePath?.trim()
    const res = chosen
      ? { canceled: false as const, filePath: chosen }
      : { canceled: true as const, filePath: undefined as string | undefined }

    if (res.canceled || !res.filePath) {
      return {
        ok: false as const,
        reason: 'cancel',
        path: null,
        count: 0,
        stickerCount: 0,
        clipCount: 0
      }
    }

    writeFileSync(res.filePath, JSON.stringify(pack, null, 2), 'utf8')
    return {
      ok: true as const,
      reason: 'saved',
      path: res.filePath,
      count: stickerItems.length + clipItems.length,
      stickerCount: stickerItems.length,
      clipCount: clipItems.length
    }
  })

  /** 导入空间：默认新建一整套；旧版仅剪贴板文件则并入当前剪贴板 */
  ipcMain.handle('clipboard:importPack', async (_e, importPath?: string) => {
    const res = importPath?.trim()
      ? { canceled: false as const, filePaths: [importPath.trim()] }
      : { canceled: true as const, filePaths: [] as string[] }

    if (res.canceled || !res.filePaths[0]) {
      return {
        ok: false as const,
        reason: 'cancel',
        added: 0,
        skipped: 0,
        history: historyViews(),
        snapshot: workspaceSnapshot()
      }
    }

    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(res.filePaths[0], 'utf8'))
    } catch {
      throw new Error('无法解析导出文件')
    }

    const pack = raw as {
      format?: string
      spaceName?: string
      folders?: Array<{
        id?: string
        name?: string
        createdAt?: number
        order?: number
        x?: number
        y?: number
        z?: number
        parentId?: string
      }>
      stickers?: Array<{
        title?: string
        content?: string
        color?: StickerColor
        x?: number
        y?: number
        z?: number
        w?: number
        h?: number
        width?: number
        height?: number
        createdAt?: number
        updatedAt?: number
        folderId?: string
        imageBase64?: string
      }>
      clipboard?: Array<{
        kind?: string
        text?: string
        imageBase64?: string
        fingerprint?: string
        createdAt?: number
      }>
      items?: Array<{
        kind?: string
        text?: string
        imageBase64?: string
        fingerprint?: string
        createdAt?: number
      }>
    }

    // 整套空间
    if (pack.format === 'stickers-workspace' || Array.isArray(pack.stickers)) {
      if (workspaces.length >= MAX_WORKSPACES) {
        throw new Error(`最多 ${MAX_WORKSPACES} 个空间，请先删除一个再导入`)
      }
      syncActiveIntoWorkspaces()

      const folderIdMap = new Map<string, string>()
      const importedFolders: StickerFolder[] = []
      for (const [i, src] of (pack.folders || []).entries()) {
        const oldId = String(src.id || '')
        const newId = uid()
        if (oldId) folderIdMap.set(oldId, newId)
        importedFolders.push({
          id: newId,
          name: String(src.name || `文件夹 ${i + 1}`).slice(0, 24),
          createdAt: Number(src.createdAt) || Date.now(),
          order: Number.isFinite(Number(src.order)) ? Number(src.order) : i,
          x: Number.isFinite(Number(src.x)) ? Number(src.x) : 48 + (i % 4) * 180,
          y: Number.isFinite(Number(src.y)) ? Number(src.y) : 56 + Math.floor(i / 4) * 140,
          z: Number.isFinite(Number(src.z)) ? Number(src.z) : i + 1,
          // parentId 稍后按映射回填
          parentId: src.parentId ? String(src.parentId) : undefined
        })
      }
      for (const f of importedFolders) {
        if (!f.parentId) continue
        const mapped = folderIdMap.get(f.parentId)
        f.parentId = mapped && mapped !== f.id ? mapped : undefined
      }

      const importedStickers: Sticker[] = []
      for (const src of pack.stickers || []) {
        let imageFile: string | undefined
        if (src.imageBase64) {
          const b64 = String(src.imageBase64).replace(/^data:image\/\w+;base64,/, '')
          const png = Buffer.from(b64, 'base64')
          if (png.length) {
            ensureDir(stickerImageDir())
            imageFile = `${uid()}.png`
            writeFileSync(join(stickerImageDir(), imageFile), png)
          }
        }
        const oldFolder = src.folderId ? String(src.folderId) : ''
        const size = clampNoteSize(src.w ?? src.width, src.h ?? src.height)
        importedStickers.push({
          id: uid(),
          title: String(src.title || ''),
          content: String(src.content || ''),
          color: COLORS.includes(src.color as StickerColor)
            ? (src.color as StickerColor)
            : 'lemon',
          x: Number(src.x) || 48,
          y: Number(src.y) || 72,
          z: Number(src.z) || 1,
          w: size.w,
          h: size.h,
          createdAt: Number(src.createdAt) || Date.now(),
          updatedAt: Number(src.updatedAt) || Date.now(),
          imageFile,
          folderId: oldFolder ? folderIdMap.get(oldFolder) : undefined
        })
      }

      const importedClip: ClipboardItem[] = []
      for (const src of pack.clipboard || []) {
        const kind = src.kind === 'image' ? 'image' : 'text'
        if (kind === 'image') {
          const b64 = String(src.imageBase64 || '').replace(/^data:image\/\w+;base64,/, '')
          if (!b64) continue
          const png = Buffer.from(b64, 'base64')
          if (!png.length) continue
          const id = uid()
          importedClip.push({
            id,
            kind: 'image',
            text: '',
            imageFile: savePng(png, id),
            fingerprint: String(src.fingerprint || `img:${hashBuffer(png)}`),
            createdAt: Number(src.createdAt) || Date.now()
          })
        } else {
          const text = String(src.text || '')
          if (!text.trim()) continue
          importedClip.push({
            id: uid(),
            kind: 'text',
            text,
            fingerprint: String(src.fingerprint || `text:${text}`),
            createdAt: Number(src.createdAt) || Date.now()
          })
        }
      }

      const space: Workspace = {
        id: uid(),
        name: String(pack.spaceName || `导入 ${workspaces.length + 1}`).slice(0, 24),
        createdAt: Date.now(),
        folders: importedFolders,
        stickers: importedStickers,
        clipboard: importedClip.slice(0, MAX_CLIPBOARD_HISTORY)
      }
      workspaces.push(space)
      activeSpaceId = space.id
      clipboardHistory = [...space.clipboard]
      maxZ = Math.max(1, ...space.stickers.map((s) => s.z || 1), 1)
      syncFingerprintToSystem()
      persistWorkspaces()
      sendClipboardHistory()
      return {
        ok: true as const,
        reason: 'workspace',
        added: space.stickers.length + space.clipboard.length,
        skipped: 0,
        history: historyViews(),
        snapshot: workspaceSnapshot()
      }
    }

    // 兼容旧版仅剪贴板导出
    const items = pack.items
    if (!Array.isArray(items)) {
      throw new Error('不是有效的贴纸空间导出文件')
    }
    if (pack.format && pack.format !== 'stickers-clipboard') {
      throw new Error('文件格式不匹配')
    }

    const existingFp = new Set(clipboardHistory.map((x) => x.fingerprint))
    let added = 0
    let skipped = 0
    for (const src of [...items].reverse()) {
      if (!src) continue
      const kind = src.kind === 'image' ? 'image' : 'text'
      if (kind === 'image') {
        const b64 = String(src.imageBase64 || '').replace(/^data:image\/\w+;base64,/, '')
        if (!b64) {
          skipped += 1
          continue
        }
        const png = Buffer.from(b64, 'base64')
        if (!png.length) {
          skipped += 1
          continue
        }
        const fingerprint = String(src.fingerprint || `img:${hashBuffer(png)}`)
        if (existingFp.has(fingerprint)) {
          skipped += 1
          continue
        }
        const id = uid()
        existingFp.add(fingerprint)
        rememberItem({
          id,
          kind: 'image',
          text: '',
          imageFile: savePng(png, id),
          fingerprint,
          createdAt: Number(src.createdAt) || Date.now()
        })
        added += 1
      } else {
        const text = String(src.text || '')
        if (!text.trim()) {
          skipped += 1
          continue
        }
        const fingerprint = String(src.fingerprint || `text:${text}`)
        if (existingFp.has(fingerprint)) {
          skipped += 1
          continue
        }
        existingFp.add(fingerprint)
        rememberItem({
          kind: 'text',
          text,
          fingerprint,
          createdAt: Number(src.createdAt) || Date.now()
        })
        added += 1
      }
    }

    sendClipboardHistory()
    return {
      ok: true as const,
      reason: 'clipboard',
      added,
      skipped,
      history: historyViews(),
      snapshot: workspaceSnapshot()
    }
  })

  createWindow(initial.alwaysOnTop)
  startClipboardWatch()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(readState().alwaysOnTop)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
