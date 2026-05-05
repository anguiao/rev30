import { Hono } from 'hono'
import { getIconSubset } from './service'

const jsonExtension = '.json'

const iconHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'Origin, X-Requested-With, Content-Type, Accept, Accept-Encoding',
  'access-control-max-age': '86400',
  'cross-origin-resource-policy': 'cross-origin',
  'cache-control': 'public, max-age=604800, min-refresh=604800, immutable',
} as const

function createHeaders(contentType: string) {
  return {
    ...iconHeaders,
    'content-type': contentType,
  }
}

function notFoundResponse() {
  return new Response('404', {
    status: 404,
    headers: createHeaders('text/plain; charset=utf-8'),
  })
}

function parsePrefix(filename: string) {
  if (!filename.endsWith(jsonExtension)) {
    return null
  }

  const prefix = filename.slice(0, -jsonExtension.length)
  return prefix.length > 0 ? prefix : null
}

export const iconRoutes = new Hono().get('/:filename', async (c) => {
  const prefix = parsePrefix(c.req.param('filename'))
  const icons = c.req.query('icons')

  if (!prefix || icons === undefined) {
    return notFoundResponse()
  }

  try {
    const subset = await getIconSubset(prefix, icons.split(','))

    if (!subset) {
      return notFoundResponse()
    }

    return new Response(JSON.stringify(subset), {
      status: 200,
      headers: createHeaders('application/json; charset=utf-8'),
    })
  } catch {
    return notFoundResponse()
  }
})
