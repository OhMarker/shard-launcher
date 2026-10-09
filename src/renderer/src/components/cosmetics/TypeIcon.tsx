import {
  Backpack,
  Crown,
  Feather,
  Flag,
  Gift,
  PartyPopper,
  Ribbon,
  Shield,
  Shirt,
  type LucideProps
} from 'lucide-react'
import { type ComponentType } from 'react'
import { type CosmeticType } from '@shared/types'

const ICONS: Record<CosmeticType, ComponentType<LucideProps>> = {
  cape: Flag,
  cloak: Shirt,
  hat: Crown,
  wings: Feather,
  bandana: Ribbon,
  backbling: Backpack,
  shield: Shield,
  emote: PartyPopper,
  bundle: Gift
}

export function TypeIcon({ type, className }: { type: CosmeticType; className?: string }) {
  const Icon = ICONS[type]
  return <Icon className={className} aria-hidden />
}
