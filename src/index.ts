import { Hono } from 'hono'
import { cache } from 'hono/cache'
import { sha256 } from 'hono/utils/crypto'
import { basicAuth } from 'hono/basic-auth'
import { detectType } from './utils'

interface Env {
  BUCKET: R2Bucket
  USER: string
  PASS: string
}

interface Data {
  body: string
}

const maxAge = 60 * 60 * 24 * 30

const app = new Hono<Env>()

// app.put('/upload', async (c, next) => {
//   const auth = basicAuth({ username: c.env.USER, password: c.env.PASS })
//   await auth(c, next)
// })

app.post('/upload', async (c) => {
  const data = await c.req.json<Data>()
  const base64 = data.body
  if (!base64) return c.notFound()

  const type = detectType(base64)
  if (!type) return c.notFound()

  const body = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))

  const key = (await sha256(body)) + '.' + type?.suffix
  await c.env.BUCKET.put(key, body, { httpMetadata: { contentType: type.mimeType } })

  return c.text(key)
})

app.get(
  '*',
  cache({
    cacheName: 'r2-image-worker',
  })
)

app.get('/:key', async (c) => {
  const key = c.req.param('key')

  const object = await c.env.BUCKET.get(key)
  if (!object) return c.notFound()
  const data = await object.arrayBuffer()
  const contentType = object.httpMetadata.contentType || ''

  return c.body(data, 200, {
    'Cache-Control': `public, max-age=${maxAge}`,
    'Content-Type': contentType,
  })
})

export default app
