import { useState } from 'react'
import { cn } from '@/lib/cn'
import { CREDIT_LINE, LICENSE_NAME, LICENSE_TEXT } from '@/lib/credits'
import { Dialog } from '@/components/ui/Dialog'

export function LicenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={LICENSE_NAME} description="Shard Launcher is open source under this license." size="lg">
      <pre className="selectable max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-[10px] border border-line bg-black/20 p-4 font-mono text-[12px] leading-relaxed text-fg-muted">
        {LICENSE_TEXT}
      </pre>
    </Dialog>
  )
}

/** A quiet "License" text button that opens the license dialog. */
export function LicenseLink({ className, label = 'License' }: { className?: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('rounded-sm underline-offset-2 transition-colors hover:text-fg-muted hover:underline', className)}
      >
        {label}
      </button>
      <LicenseDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

/** Credit line at the bottom of the sidebar. */
export function CreditsFooter() {
  return (
    <p className="mt-2.5 text-balance px-1 text-[10.5px] leading-snug text-fg-subtle">
      {CREDIT_LINE} · <LicenseLink />
    </p>
  )
}
