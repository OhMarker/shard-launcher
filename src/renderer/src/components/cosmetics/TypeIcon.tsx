import {
  Backpack,
  Crown,
  Feather,
  Flag,
  PartyPopper,
  Ribbon,
  Shield,
  type LucideProps
} from 'lucide-react'
import { type ComponentType } from 'react'
import { type CosmeticType } from '@shared/types'

const ICONS: Record<CosmeticType, ComponentType<LucideProps>> = {
  cape: Flag,
  cloak: Shield,
  hat: Crown,
  wings: Feather,
  bandana: Ribbon,
  backbling: Backpack,
  emote: PartyPopper
}

export function TypeIcon({ type, className }: { type: CosmeticType; className?: string }) {
  const Icon = ICONS[type]
  return <Icon className={className} aria-hidden />
}
