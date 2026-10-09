import { z } from 'zod'

// ---------------------------------------------------------------------------
// services.json (hosted in the meta repository) and Shard API responses.
// See CONTRACT.md and shard-api/API.md. Unknown fields are ignored so the API can grow.
// ---------------------------------------------------------------------------

export const ServicesJsonSchema = z.object({ api: z.string().min(1) })

const uuid = z.string().regex(/^[0-9a-f]{32}$/)
/** Older APIs send no role; they parse as null. */
const role = z.enum(['owner', 'admin', 'mod']).nullable().optional().default(null)

export const ShardMeSchema = z.object({
  uuid,
  name: z.string(),
  tokens: z.number().int(),
  owned: z.array(z.string()),
  cape: z.string().nullable(),
  /** Every slot the API stores (since the OhMarker set); older APIs send only `cape`. */
  equipped: z
    .object({
      cape: z.string().nullable().default(null),
      shield: z.string().nullable().default(null),
      bandana: z.string().nullable().default(null)
    })
    .optional(),
  admin: z.boolean(),
  role,
  inGame: z.boolean().default(false),
  secondsToNextTokens: z.number().default(600)
})

export const VerifyResponseSchema = z.object({ session: z.string().min(1), me: ShardMeSchema })
export const ChallengeResponseSchema = z.object({ serverId: z.string().regex(/^[0-9a-f]{32}$/) })

const count = z.number().int().nonnegative().catch(0).default(0)

/**
 * Bundles carry the ids they give in `items`. `basePrice` and `salePercent` arrived with sales;
 * older APIs send neither, so the base price is the price and there is no sale.
 */
const ShopItemBase = z.object({
  id: z.string(),
  price: z.number().int(),
  basePrice: z.number().int().optional(),
  salePercent: z.number().int().min(0).max(90).catch(0).default(0),
  items: z.array(z.string()).optional()
})
type ShopItemRaw = z.infer<typeof ShopItemBase>
const withBase = <T extends ShopItemRaw>(item: T): T & { basePrice: number } => ({
  ...item,
  basePrice: item.basePrice ?? item.price,
  salePercent: item.basePrice === undefined || item.basePrice <= item.price ? 0 : item.salePercent
})
export const ShopItemSchema = ShopItemBase.transform(withBase)
export const ShopResponseSchema = z.object({ items: z.array(ShopItemSchema) })

/** Admin shop rows add `hidden` and `sold` (both default for older or partial answers). */
export const AdminShopItemSchema = ShopItemBase.extend({
  hidden: z.boolean().catch(false).default(false),
  sold: count
}).transform(withBase)
export const AdminShopResponseSchema = z.object({ items: z.array(AdminShopItemSchema) })

export const AdminStatsSchema = z.object({
  players: count,
  inGameNow: count,
  activeToday: count,
  tokensHeld: z.number().int().catch(0).default(0),
  purchases: count,
  codeRedemptions: count,
  staff: count
})

export const PromoCodeSchema = z.object({
  code: z.string().min(1),
  tokens: count,
  items: z.array(z.string()).catch([]).default([]),
  maxUses: z.number().int().positive().nullable().catch(null).default(null),
  expiresAt: z.number().int().nonnegative().nullable().catch(null).default(null),
  round: z.number().int().catch(1).default(1),
  active: z.boolean().catch(true).default(true),
  note: z.string().nullable().catch('').default('').transform((n) => n ?? ''),
  usesThisRound: count,
  usesTotal: count,
  createdAt: z.number().nullable().catch(null).default(null)
})
export const PromoCodesResponseSchema = z.object({ codes: z.array(PromoCodeSchema) })
export const DeletedCodeSchema = z.object({ deleted: z.string() })

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
  role,
  inGame: z.boolean().default(false),
  lastSeen: z.number().nullable()
})

export const AdminPlayersResponseSchema = z.object({ players: z.array(AdminPlayerSchema) })
export const AdminStaffResponseSchema = z.object({ staff: z.array(AdminPlayerSchema) })

export const RedeemResponseSchema = z.object({
  granted: z.object({ tokens: count, items: z.array(z.string()).catch([]).default([]) }),
  me: ShardMeSchema
})
