import { bodyLimit } from 'hono/body-limit'

export function createBodyLimit(maxSize: number) {
  return bodyLimit({
    maxSize,
    onError: (c) => c.json({ message: '请求体过大' }, 413),
  })
}

const jsonContentTypePattern = /^application\/(?:[\w!#$&^.+-]+\+)?json(?:\s*;|$)/i

export function createJsonBodyLimit(maxSize: number) {
  const limit = createBodyLimit(maxSize)

  return async (...args: Parameters<typeof limit>) => {
    const [c, next] = args
    const contentType = c.req.header('content-type')

    if (!contentType || !jsonContentTypePattern.test(contentType)) {
      await next()
      return
    }

    return limit(c, next)
  }
}
