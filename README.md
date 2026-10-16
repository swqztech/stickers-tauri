# 贴纸板 (Stickers, Tauri)

Desktop sticker board migrated from Electron. UI in React; workspace/clipboard engine runs in a bundled Node sidecar (same data dir as the Electron app: `%AppData%/stickers`).

## Develop

```bash
npm install
npm run build:api
npm run dev
```

Requires Node.js on PATH for the sidecar.

## Release

```bash
npm run build:client
```

Launch: `Launch-Stickers.cmd`
