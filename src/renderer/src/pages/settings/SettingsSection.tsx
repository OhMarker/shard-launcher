import { type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/Card'
import { Switch } from '@/components/ui/Switch'

export interface SettingsSectionProps {
  id: string
  title: string
  description?: string
  icon: ReactNode
  children: ReactNode
}

/** An anchored section: heading plus a card whose rows are divided by hairlines. */
export function SettingsSection({ id, title, description, icon, children }: SettingsSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4">
      <div className="mb-3 flex items-center gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-line bg-white/5 text-accent [&_svg]:size-[18px]"
          aria-hidden
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-lg font-semibold tracking-tight text-fg">
            {title}
          </h2>
          {description && <p className="text-[13px] text-fg-muted">{description}</p>}
        </div>
      </div>
      <Card padding="none" className="divide-y divide-line">
        {children}
      </Card>
    </section>
  )
}

export interface SettingRowProps {
  label: ReactNode
  description?: ReactNode
  children: ReactNode
  /** Control below the label instead of to its right (sliders, lists, wide inputs). */
  stacked?: boolean
  className?: string
}

export function SettingRow({ label, description, children, stacked, className }: SettingRowProps) {
  return (
    <div className={cn('px-5 py-4', stacked ? 'space-y-3' : 'flex items-center justify-between gap-6', className)}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{label}</div>
        {description && <div className="mt-0.5 text-[13px] leading-snug text-fg-muted">{description}</div>}
      </div>
      <div className={cn(!stacked && 'shrink-0')}>{children}</div>
    </div>
  )
}

export interface SwitchRowProps {
  label: ReactNode
  description?: ReactNode
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}

export function SwitchRow({ label, description, checked, onCheckedChange, disabled }: SwitchRowProps) {
  return (
    <div className="px-5 py-4">
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} label={label} description={description} />
    </div>
  )
}
