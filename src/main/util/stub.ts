import { ShardError } from '@shared/errors'

/** Temporary placeholder used while a feature module is being implemented. */
export function notImplemented<T extends object>(name: string): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      if (prop === 'then') return undefined
      return () => {
        throw new ShardError('UNKNOWN', `${name}.${String(prop)} is not implemented yet`)
      }
    }
  })
}
