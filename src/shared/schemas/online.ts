import { z } from 'zod'

// ---------------------------------------------------------------------------
// services.json (hosted in the meta repository) and Shard API responses.
// See CONTRACT.md and shard-api/API.md. Unknown fields are ignored so the API can grow.
// ---------------------------------------------------------------------------

export const ServicesJsonSchema = z.object({ api: z.string().min(1) })

const uuid = z.string().regex(/^[0-9a-f]{32}$/)

export const ShardMeSchema = z.object({
  uuid,
  name: z.string(),
  tokens: z.number().int(),
  owned: z.array(z.string()),
  cape: z.string().nullable(),
  admin: z.boolean(),
  inGame: z.boolean().default(false),
  secondsToNextTokens: z.number().default(600)
})

export const VerifyResponseSchema = z.object({ session: z.string().min(1), me: ShardMeSchema })
export const ChallengeResponseSchema = z.object({ serverId: z.string().regex(/^[0-9a-f]{32}$/) })

export const ShopItemSchema = z.object({ id: z.string(), price: z.number().int() })
export const ShopResponseSchema = z.object({ items: z.array(ShopItemSchema) })

const PersonSchema = z.object({ uuid, name: z.string() })

export const FriendsViewSchema = z.object({
  friends: z.array(PersonSchema.extend({ inGame: z.boolean(), lastSeen: z.number().nullable() })),
  incoming: z.array(PersonSchema),
  outgoing: z.array(PersonSchema)
})

export const AdminPlayerSchema = z.object({
  uuid,
  name: z.string(),
  tokens: z.number().int(),
  owned: z.array(z.string()),
  cape: z.string().nullable(),
  admin: z.boolean(),
  inGame: z.boolean().default(false),
  lastSeen: z.number().nullable()
})

export const AdminPlayersResponseSchema = z.object({ players: z.array(AdminPlayerSchema) })
