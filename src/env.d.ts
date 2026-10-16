import type { desktopApi } from './desktopApi'

declare global {
  interface Window {
    api: typeof desktopApi
  }
}

export {}
