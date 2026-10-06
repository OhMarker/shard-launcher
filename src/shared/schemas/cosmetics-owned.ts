import { z } from 'zod'

/**
 * <data>/cosmetics/owned.json: cosmetic ids unlocked on this install in addition to the
 * manifest's free ones. The launcher only reads it today; a future entitlement service
 * writes it, which is why it is a plain id list rather than something richer.
 */
export const OwnedCosmeticsSchema = z.array(z.string().min(1))
export type OwnedCosmetics = z.infer<typeof OwnedCosmeticsSchema>
