import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import { join } from 'node:path'
import clipboardy from 'clipboardy'
import fs from 'node:fs'

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown

const handlers = new Map<string, IpcHandler>()
const bus = new EventEmitter()

export function getIpcHandlers() {
  return handlers
}

export function emitToRenderer(channel: string, payload: unknown) {
  bus.emit('push', channel, payload)
}

export function onRendererPush(cb: (channel: string, payload: unknown) => void) {
  bus.on('push', cb)
}

class MockWebContents {
  send(channel: string, payload: unknown) {
    emitToRenderer(channel, payload)
  }
  isDestroyed() {
    return false
  }
  setWindowOpenHandler() {
    return { action: 'deny' as const }
  }
  on() {
    return undefined
  }
}

class MockWindow {
  webContents = new MockWebContents()
  isDestroyed() {
    return false
  }
  show() {}
  setAlwaysOnTop() {}
  on() {}
}

let mockWindow: MockWindow | null = null

export const app = {
  getPath(name: string) {
    if (name === 'userData') {
      return join(homedir(), 'AppData', 'Roaming', 'stickers')
    }
    return join(homedir(), 'AppData', 'Roaming', 'stickers')
  },
  whenReady() {
    return Promise.resolve({
      then(fn: () => void) {
        fn()
        return Promise.resolve()
      }
    })
  },
  on() {},
  quit() {}
}

export const ipcMain = {
  handle(channel: string, fn: IpcHandler) {
    handlers.set(channel, fn)
  }
}

export const clipboard = {
  readText() {
    try {
      return clipboardy.readSync()
    } catch {
      return ''
    }
  },
  writeText(text: string) {
    clipboardy.writeSync(text)
  },
  readImage() {
    return nativeImage.createFromBuffer(Buffer.alloc(0))
  },
  writeImage(img: { toPNG: () => Buffer }) {
    const png = img.toPNG()
    if (png.length) {
      clipboardy.writeSync(png)
    }
  }
}

export const nativeImage = {
  createFromPath(filePath: string) {
    let buf: Buffer = Buffer.alloc(0)
    try {
      buf = fs.readFileSync(filePath)
    } catch {
      buf = Buffer.alloc(0)
    }
    return {
      isEmpty() {
        return !buf.length
      },
      toPNG() {
        return buf
      }
    }
  },
  createFromBuffer(buf: Buffer) {
    return {
      isEmpty() {
        return !buf?.length
      },
      toPNG() {
        return buf
      }
    }
  }
}

export const BrowserWindow = Object.assign(
  class {
    webContents = new MockWebContents()
    constructor() {
      mockWindow = this as unknown as MockWindow
    }
    static getFocusedWindow() {
      return mockWindow
    }
    isDestroyed() {
      return false
    }
    show() {}
    setAlwaysOnTop() {}
    on() {}
    loadFile() {}
    loadURL() {}
  },
  { getFocusedWindow: () => mockWindow }
)

export const shell = {
  openExternal() {},
  openPath() {
    return Promise.resolve('')
  },
  showItemInFolder() {}
}

export const Menu = {
  buildFromTemplate() {
    return { popup() {} }
  }
}

export const dialog = {
  async showSaveDialog(_win: unknown, opts: { defaultPath?: string }) {
    return { canceled: true, filePath: undefined, defaultPath: opts?.defaultPath }
  },
  async showOpenDialog() {
    return { canceled: true, filePaths: [] as string[] }
  }
}

export const electronApp = { setAppUserModelId() {} }
export const optimizer = { watchWindowShortcuts() {} }
export const is = { dev: false }
