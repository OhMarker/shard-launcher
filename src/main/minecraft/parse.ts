import { type ZodType } from 'zod'
import { ShardError } from '@shared/errors'

/** Parses a downloaded JSON document and validates it, mapping failures to MANIFEST_INVALID. */
export function parseJsonBuffer<T>(buffer: Buffer, schema: ZodType<T>, what: string): T {
  let json: unknown
  try {
    json = JSON.parse(buffer.toString('utf8'))
  } catch (err) {
    throw new ShardError('MANIFEST_INVALID', `${what} is not valid JSON`, { cause: err })
  }
  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    throw new ShardError('MANIFEST_INVALID', `${what} has an unexpected shape`, {
      details: parsed.error.issues.slice(0, 10)
    })
  }
  return parsed.data
}
