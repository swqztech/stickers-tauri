import cors from 'cors'
import express from 'express'
import { getIpcHandlers, onRendererPush } from './electron-shim.js'

const PORT = Number(process.env.PORT) || 3923

async function main() {
  await import('./core')

  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '32mb' }))

  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.post('/invoke', async (req, res) => {
    const channel = String(req.body?.channel || '')
    const args = Array.isArray(req.body?.args) ? req.body.args : []
    const handler = getIpcHandlers().get(channel)
    if (!handler) {
      res.status(404).json({ error: `unknown channel: ${channel}` })
      return
    }
    try {
      const result = await handler({}, ...args)
      res.json({ ok: true, result })
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err)
      })
    }
  })

  app.get('/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.flushHeaders()
    const listener = (channel: string, payload: unknown) => {
      res.write(`event: ${channel}\n`)
      res.write(`data: ${JSON.stringify(payload)}\n\n`)
    }
    onRendererPush(listener)
    req.on('close', () => {
      res.end()
    })
  })

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[stickers-api] listening on ${PORT}`)
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
