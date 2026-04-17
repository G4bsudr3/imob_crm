import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'
import { cn } from '../../lib/utils'

type ToastVariant = 'success' | 'error' | 'info' | 'warning'

type Toast = {
  id: string
  variant: ToastVariant
  title: string
  description?: string
  /** Se true, não remove automaticamente (usuário precisa dispensar). Errors são sticky por padrão. */
  sticky?: boolean
}

type ToastContextValue = {
  toast: (opts: Omit<Toast, 'id'>) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-success/30 bg-success-soft text-success',
  error: 'border-destructive/30 bg-destructive-soft text-destructive',
  info: 'border-info/30 bg-info-soft text-info',
  warning: 'border-warning/30 bg-warning-soft text-warning',
}

const ICONS: Record<ToastVariant, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertCircle,
}

const SUCCESS_TIMEOUT = 4200
const INFO_TIMEOUT = 5000
const WARNING_TIMEOUT = 6500
// Errors don't auto-dismiss — user must close manually

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback((opts: Omit<Toast, 'id'>) => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, ...opts }])
    const isSticky = opts.sticky ?? opts.variant === 'error'
    if (!isSticky) {
      const timeout = opts.variant === 'warning' ? WARNING_TIMEOUT : opts.variant === 'info' ? INFO_TIMEOUT : SUCCESS_TIMEOUT
      setTimeout(() => dismiss(id), timeout)
    }
  }, [dismiss])

  const success = useCallback((title: string, description?: string) => toast({ variant: 'success', title, description }), [toast])
  const error = useCallback((title: string, description?: string) => toast({ variant: 'error', title, description }), [toast])
  const info = useCallback((title: string, description?: string) => toast({ variant: 'info', title, description }), [toast])
  const warning = useCallback((title: string, description?: string) => toast({ variant: 'warning', title, description }), [toast])

  return (
    <ToastContext.Provider value={{ toast, success, error, info, warning }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-[380px] w-full pointer-events-none"
        role="region"
        aria-label="Notificações"
      >
        {toasts.map((t) => <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [visible, setVisible] = useState(false)
  const Icon = ICONS[toast.variant]
  const ariaRole = toast.variant === 'error' || toast.variant === 'warning' ? 'alert' : 'status'
  const ariaLive = toast.variant === 'error' ? 'assertive' : 'polite'

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10)
    return () => clearTimeout(t)
  }, [])

  return (
    <div
      role={ariaRole}
      aria-live={ariaLive}
      aria-atomic="true"
      className={cn(
        'pointer-events-auto flex items-start gap-3 rounded-xl border bg-card shadow-float px-4 py-3 transition-all duration-200',
        VARIANT_STYLES[toast.variant],
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
      )}
    >
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground leading-tight">{toast.title}</p>
        {toast.description && (
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{toast.description}</p>
        )}
      </div>
      <button
        onClick={onDismiss}
        aria-label="Dispensar notificação"
        className="text-muted-foreground hover:text-foreground transition-colors -mr-1 -mt-1 p-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <X size={12} aria-hidden="true" />
      </button>
    </div>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
