import { z } from 'zod'

/**
 * Payload of an opcode-1 (FRAME) message received from the Discord desktop client over its
 * local IPC socket. Only the envelope is typed; `data` differs per command/event.
 */
export const DiscordIpcMessageSchema = z.object({
  cmd: z.string().optional(),
  evt: z.string().nullable().optional(),
  nonce: z.string().nullable().optional(),
  data: z.unknown().optional()
})
export type DiscordIpcMessage = z.infer<typeof DiscordIpcMessageSchema>
