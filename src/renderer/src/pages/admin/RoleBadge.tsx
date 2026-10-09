import { ROLE_LABELS, staffRoleOf } from '@shared/online'
import { type StaffRole } from '@shared/types'
import { Badge, type BadgeTone } from '@/components/ui/Badge'

const TONES: Record<StaffRole, BadgeTone> = { owner: 'accent', admin: 'neutral', mod: 'outline' }

/** Owner / Admin / Mod next to a player's name; nothing for players without a role. */
export function RoleBadge({ player }: { player: { admin: boolean; role?: StaffRole | null } }) {
  const role = staffRoleOf(player)
  if (!role) return null
  return (
    <Badge size="sm" tone={TONES[role]}>
      {ROLE_LABELS[role]}
    </Badge>
  )
}
