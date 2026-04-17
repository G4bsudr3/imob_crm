import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { cn } from '../../lib/utils'

type Props = {
  value: string
  onChange: (value: string) => void
  length?: number
  autoFocus?: boolean
  disabled?: boolean
  onComplete?: (value: string) => void
}

export function OtpInput({ value, onChange, length = 6, autoFocus, disabled, onComplete }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (value.length === length && onComplete) onComplete(value)
  }, [value, length, onComplete])

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1)
    const next = value.split('')
    next[index] = digit
    const joined = next.join('').slice(0, length)
    onChange(joined)
    if (digit && index < length - 1) refs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (value[index]) {
        const next = value.split('')
        next[index] = ''
        onChange(next.join(''))
      } else if (index > 0) {
        refs.current[index - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus()
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      refs.current[index + 1]?.focus()
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    onChange(pasted.padEnd(value.length, '').slice(0, length))
    const nextIdx = Math.min(pasted.length, length - 1)
    refs.current[nextIdx]?.focus()
  }

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] ?? ''}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className={cn(
            'h-12 w-11 text-center text-lg font-semibold tabular',
            'bg-background text-foreground border border-border rounded-lg',
            'focus:outline-none focus:border-ring focus:ring-2 focus:ring-ring/20',
            'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
          )}
        />
      ))}
    </div>
  )
}
