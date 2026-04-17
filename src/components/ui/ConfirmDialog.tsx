import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from './Button'

type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'default' | 'destructive'
}

type ConfirmContextValue = {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{
    opts: ConfirmOptions
    resolve: (v: boolean) => void
  } | null>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ opts, resolve })
    })
  }, [])

  function handle(result: boolean) {
    pending?.resolve(result)
    setPending(null)
  }

  useEffect(() => {
    if (!pending) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') handle(false)
      if (e.key === 'Enter') handle(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending])

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 animate-fade-in">
          <div className="absolute inset-0 bg-black/40 dark:bg-black/70 backdrop-blur-sm" onClick={() => handle(false)} />
          <div className="relative bg-card border border-border rounded-xl shadow-float w-full max-w-sm p-5 animate-zoom-in-95">
            <div className="flex items-start gap-3">
              {pending.opts.variant === 'destructive' && (
                <div className="h-9 w-9 rounded-full bg-destructive-soft text-destructive flex items-center justify-center shrink-0">
                  <AlertTriangle size={16} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold tracking-tight">{pending.opts.title}</p>
                {pending.opts.description && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{pending.opts.description}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" size="sm" onClick={() => handle(false)}>
                {pending.opts.cancelLabel ?? 'Cancelar'}
              </Button>
              <Button
                variant={pending.opts.variant === 'destructive' ? 'destructive' : 'primary'}
                size="sm"
                onClick={() => handle(true)}
                autoFocus
              >
                {pending.opts.confirmLabel ?? 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>')
  return ctx.confirm
}
