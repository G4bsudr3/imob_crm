import { cn } from '../../lib/utils'
import type { HTMLAttributes } from 'react'

type Variant = 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant
  dot?: boolean
}

const VARIANTS: Record<Variant, string> = {
  neutral: 'bg-subtle text-subtle-foreground border-border',
  primary: 'bg-primary-soft text-primary-soft-foreground border-primary/10',
  success: 'bg-success-soft text-success border-success/10',
  warning: 'bg-warning-soft text-warning border-warning/10',
  destructive: 'bg-destructive-soft text-destructive border-destructive/10',
  info: 'bg-info-soft text-info border-info/10',
}

const DOT_COLORS: Record<Variant, string> = {
  neutral: 'bg-muted-foreground',
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  info: 'bg-info',
}

export function Badge({ className, variant = 'neutral', dot, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOT_COLORS[variant])} />}
      {children}
    </span>
  )
}
