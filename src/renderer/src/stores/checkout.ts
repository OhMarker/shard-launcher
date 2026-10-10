import { create } from 'zustand'
import { formatShards, storeErrorMessage } from '@shared/online'
import { type OnlineState, type StorePack } from '@shared/types'
import { invoke, queryClient, queryKeys } from '@/lib/api'
import { toast } from './ui'

/** How often and how long the launcher asks whether a checkout was paid. */
const POLL_MS = 3_000
const GIVE_UP_MS = 30 * 60_000

export interface PendingCheckout {
  sessionId: string
  url: string
  pack: StorePack
  startedAt: number
}

interface CheckoutState {
  pending: PendingCheckout | null
  checking: boolean
  /** Opens Stripe Checkout in the browser and waits for the payment. */
  start: (pack: StorePack) => Promise<void>
  /** Asks the API right now (the "I paid" button). */
  checkNow: () => Promise<void>
  /** Stops waiting (the player closed the payment page). Paying later still adds the Shards. */
  stopWaiting: () => void
}

let timer: ReturnType<typeof setInterval> | null = null

function stopTimer(): void {
  if (timer) clearInterval(timer)
  timer = null
}

async function refreshAfterPurchase(): Promise<void> {
  const state = await invoke('online:state', { refresh: true }).catch(() => null)
  if (state) queryClient.setQueryData<OnlineState>(queryKeys.online, state)
  void queryClient.invalidateQueries({ queryKey: queryKeys.storePurchases })
}

export const useCheckout = create<CheckoutState>((set, get) => ({
  pending: null,
  checking: false,

  async start(pack) {
    const checkout = await invoke('store:checkout', { packId: pack.id })
    set({ pending: { sessionId: checkout.sessionId, url: checkout.url, pack, startedAt: Date.now() } })
    stopTimer()
    timer = setInterval(() => void get().checkNow(), POLL_MS)
  },

  async checkNow() {
    const pending = get().pending
    if (!pending || get().checking) return
    if (Date.now() - pending.startedAt > GIVE_UP_MS) {
      get().stopWaiting()
      return
    }
    set({ checking: true })
    try {
      const { purchase, credited } = await invoke('store:confirm', { sessionId: pending.sessionId })
      if (purchase.status === 'paid') {
        stopTimer()
        set({ pending: null })
        await refreshAfterPurchase()
        if (credited || purchase.creditedAt) {
          toast({ kind: 'success', title: `Payment received: +${formatShards(purchase.shards)} Shards`, message: 'They are in your balance now. Thank you for supporting Shard!' })
        }
      } else if (purchase.status === 'expired') {
        stopTimer()
        set({ pending: null })
        toast({ kind: 'info', title: 'Checkout closed', message: 'That payment page expired. Nothing was charged.' })
      }
    } catch (err) {
      // Keep waiting through short hiccups; the API credits the purchase from Stripe's webhook anyway.
      console.warn('store confirm failed', storeErrorMessage(err))
    } finally {
      set({ checking: false })
    }
  },

  stopWaiting() {
    stopTimer()
    set({ pending: null })
    void queryClient.invalidateQueries({ queryKey: queryKeys.storePurchases })
  }
}))
