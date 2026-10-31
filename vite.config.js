import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { Readable } from 'node:stream'

function localPinataProxy(pinataJwt) {
  return {
    name: 'local-pinata-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const upload = req.method === 'POST' && req.url === '/api/pinata/upload'
        const unpin = req.method === 'DELETE' && /^\/api\/pinata\/unpin\/[A-Za-z0-9]+$/.test(req.url || '')
        if (!upload && !unpin) return next()
        if (!pinataJwt) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Set PINATA_JWT in your local .env file.' }))
          return
        }

        const path = upload
          ? '/pinning/pinFileToIPFS'
          : `/pinning/unpin/${req.url.split('/').at(-1)}`
        try {
          const response = await fetch(`https://api.pinata.cloud${path}`, {
            method: req.method,
            headers: {
              Authorization: `Bearer ${pinataJwt}`,
              ...(upload && req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}),
            },
            ...(upload ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
          })
          res.statusCode = response.status
          response.headers.forEach((value, name) => res.setHeader(name, value))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Pinata request failed.' }))
          server.config.logger.error(`Local Pinata proxy failed: ${error.message}`)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), localPinataProxy(env.PINATA_JWT)],
  }
})
