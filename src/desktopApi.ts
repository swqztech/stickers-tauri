import { getCurrentWebview } from '@tauri-apps/api/webview'

import { getCurrentWindow } from '@tauri-apps/api/window'

import { save, open } from '@tauri-apps/plugin-dialog'



const API = 'http://127.0.0.1:3923'

export type WorkspaceSnapshot = {
  activeSpaceId: string
  spaces: Array<{
    id: string
    name: string
    stickerCount?: number
    clipCount?: number
    count?: number
  }>
  history: unknown[]
  stickers: unknown[]
  folders: unknown[]
  alwaysOnTop: boolean
}

export type ClipboardPackImportResult = {
  ok: boolean
  reason?: string
  added: number
  skipped?: number
  history?: unknown[]
  snapshot?: WorkspaceSnapshot
}

export type ClipboardExportResult = {
  ok: boolean
  reason?: string
  path?: string | null
  count?: number
  stickerCount?: number
  clipCount?: number
}

async function ipc<T>(channel: string, ...args: unknown[]): Promise<T> {

  const res = await fetch(`${API}/invoke`, {

    method: 'POST',

    headers: { 'Content-Type': 'application/json' },

    body: JSON.stringify({ channel, args })

  })

  const data = (await res.json()) as { ok?: boolean; result?: T; error?: string }

  if (!data.ok) {

    throw new Error(data.error || `invoke failed: ${channel}`)

  }

  return data.result as T

}



const dropPathByName = new Map<string, string>()

let dragReady = false



async function ensureDragDrop() {

  if (dragReady) return

  dragReady = true

  try {

    const webview = getCurrentWebview()

    await webview.onDragDropEvent((event) => {

      if (event.payload.type === 'drop' && event.payload.paths?.length) {

        for (const p of event.payload.paths) {

          const name = p.replace(/\\/g, '/').split('/').pop() || p

          dropPathByName.set(name, p)

        }

      }

    })

  } catch {

    // ignore

  }

}



function listenEvents() {

  const es = new EventSource(`${API}/events`)

  const handlers = {

    'clipboard:history': [] as Array<(items: unknown) => void>,

    'clipboard:spaces': [] as Array<(state: unknown) => void>,

    'workspace:changed': [] as Array<(state: unknown) => void>

  }



  es.addEventListener('clipboard:history', (e) => {

    const payload = JSON.parse((e as MessageEvent).data)

    handlers['clipboard:history'].forEach((cb) => cb(payload))

  })

  es.addEventListener('clipboard:spaces', (e) => {

    const payload = JSON.parse((e as MessageEvent).data)

    handlers['clipboard:spaces'].forEach((cb) => cb(payload))

  })

  es.addEventListener('workspace:changed', (e) => {

    const payload = JSON.parse((e as MessageEvent).data)

    handlers['workspace:changed'].forEach((cb) => cb(payload))

  })



  return handlers

}



const eventHandlers = listenEvents()



export const desktopApi = {

  loadBoard: () => ipc('board:load'),

  saveBoard: (state: unknown) => ipc('board:save', state),

  setAlwaysOnTop: async (enabled: boolean) => {

    await getCurrentWindow().setAlwaysOnTop(enabled)

    return ipc<boolean>('board:setAlwaysOnTop', enabled)

  },

  createSticker: (payload?: unknown) => ipc('sticker:create', payload),

  createStickerFromClipboard: () => ipc('sticker:fromClipboard'),

  createStickerFromImage: (base64Png: string, meta?: unknown) =>

    ipc('sticker:fromImageData', base64Png, meta),

  saveStickerImage: async (stickerId: string) => {

    const filePath = await save({

      title: '保存图片贴纸',

      filters: [{ name: 'PNG', extensions: ['png'] }]

    })

    if (!filePath) return { ok: false as const, reason: 'cancel', path: null }

    return ipc('sticker:saveImage', stickerId, filePath)

  },

  saveVisibleStickerImages: async (stickerIds: string[]) => {

    const dir = await open({

      title: '选择保存图片的文件夹',

      directory: true,

      multiple: false

    })

    if (!dir || Array.isArray(dir)) {

      return {

        ok: false as const,

        reason: 'cancel',

        dir: null,

        saved: 0,

        skipped: 0

      }

    }

    return ipc('sticker:saveVisibleImages', stickerIds, dir)

  },

  createStickersFromFiles: (items: unknown) => ipc('sticker:fromFiles', items),

  getPathForFile: (file: File) => {

    void ensureDragDrop()

    return dropPathByName.get(file.name) || ''

  },

  readClipboard: () => ipc<string>('clipboard:read'),

  writeClipboard: (text: string) => ipc('clipboard:write', text),

  writeClipboardItem: (id: string) => ipc('clipboard:writeItem', id),

  captureClipboard: () => ipc('clipboard:capture'),

  importClipboardImage: (base64Png: string) => ipc('clipboard:importImage', base64Png),

  getClipboardHistory: () => ipc('clipboard:history'),

  getClipboardSpaces: () => ipc('clipboard:spaces'),

  getWorkspaceSnapshot: () => ipc<WorkspaceSnapshot>('workspace:snapshot'),

  clearWorkspace: () => ipc<WorkspaceSnapshot>('workspace:clear'),

  moveWorkspaceItems: (payload: unknown) =>
    ipc<WorkspaceSnapshot>('workspace:moveItems', payload),

  createClipboardSpace: (

    name?: string,

    stickers?: unknown,

    fromSpaceId?: string,

    folders?: unknown

  ) => ipc<WorkspaceSnapshot>('clipboard:createSpace', name, stickers, fromSpaceId, folders),

  switchClipboardSpace: (

    id: string,

    stickers?: unknown,

    fromSpaceId?: string,

    folders?: unknown

  ) => ipc<WorkspaceSnapshot>('clipboard:switchSpace', id, stickers, fromSpaceId, folders),

  renameClipboardSpace: (id: string, name: string) =>

    ipc<WorkspaceSnapshot>('clipboard:renameSpace', id, name),

  reorderClipboardSpaces: (orderedIds: string[]) =>

    ipc<WorkspaceSnapshot>('clipboard:reorderSpaces', orderedIds),

  deleteClipboardSpace: (

    id: string,

    stickers?: unknown,

    fromSpaceId?: string,

    folders?: unknown

  ) => ipc<WorkspaceSnapshot>('clipboard:deleteSpace', id, stickers, fromSpaceId, folders),

  removeClipboardItem: (id: string) => ipc('clipboard:remove', id),

  clearClipboardHistory: () => ipc('clipboard:clear'),

  exportClipboardHistory: async (stickers?: unknown) => {

    const filePath = await save({

      title: '导出贴纸空间',

      filters: [{ name: 'JSON', extensions: ['json'] }]

    })

    if (!filePath) {

      return {

        ok: false as const,

        reason: 'cancel',

        path: null,

        count: 0,

        stickerCount: 0,

        clipCount: 0

      }

    }

    return ipc<ClipboardExportResult>('clipboard:export', stickers, filePath)

  },

  importClipboardPack: async (): Promise<ClipboardPackImportResult> => {

    const filePath = await open({

      title: '导入贴纸空间',

      filters: [{ name: 'JSON', extensions: ['json'] }],

      multiple: false

    })

    if (!filePath || Array.isArray(filePath)) {

      return {

        ok: false as const,

        reason: 'cancel',

        added: 0,

        skipped: 0,

        history: [],

        snapshot: undefined

      }

    }

    return ipc<ClipboardPackImportResult>('clipboard:importPack', filePath)

  },

  onClipboardHistory: (callback: (items: unknown) => void) => {

    eventHandlers['clipboard:history'].push(callback)

    return () => {

      const list = eventHandlers['clipboard:history']

      const i = list.indexOf(callback)

      if (i >= 0) list.splice(i, 1)

    }

  },

  onClipboardSpaces: (callback: (state: unknown) => void) => {

    eventHandlers['clipboard:spaces'].push(callback)

    return () => {

      const list = eventHandlers['clipboard:spaces']

      const i = list.indexOf(callback)

      if (i >= 0) list.splice(i, 1)

    }

  },

  onWorkspaceChanged: (callback: (state: unknown) => void) => {

    eventHandlers['workspace:changed'].push(callback)

    return () => {

      const list = eventHandlers['workspace:changed']

      const i = list.indexOf(callback)

      if (i >= 0) list.splice(i, 1)

    }

  }

}



declare global {

  interface Window {

    api: typeof desktopApi

  }

}



export function installDesktopApi() {

  window.api = desktopApi

  void ensureDragDrop()

}


