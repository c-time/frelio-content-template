interface Env {
  R2: R2Bucket
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const path = context.params.path
  const key = Array.isArray(path) ? path.join('/') : path

  if (!key) {
    return new Response('Not Found', { status: 404 })
  }

  const object = await context.env.R2.get(key)
  if (!object) {
    return new Response('Not Found', { status: 404 })
  }

  const headers = new Headers()
  headers.set(
    'Content-Type',
    object.httpMetadata?.contentType || 'application/octet-stream',
  )
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('ETag', object.httpEtag)

  return new Response(object.body, { status: 200, headers })
}
