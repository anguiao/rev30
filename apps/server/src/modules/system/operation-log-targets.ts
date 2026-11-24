import type { HonoRequest } from 'hono'

export function operationLogCodeAndNameTarget(
  request: Pick<HonoRequest<string, { json: { code: string; name: string } }>, 'valid'>,
) {
  const { code, name } = request.valid('json')

  return { targetKey: code, targetLabel: name }
}

export function operationLogIdAndNameTarget(
  request: Pick<
    HonoRequest<string, { param: { id: string }; json: { name?: string | undefined } }>,
    'valid'
  >,
) {
  return { targetKey: request.valid('param').id, targetLabel: request.valid('json').name }
}
