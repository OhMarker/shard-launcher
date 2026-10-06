/// <reference types="vite/client" />

import type { ShardApi } from '../shared/ipc'

declare global {
  interface Window {
    shard: ShardApi
  }
}

export {}
