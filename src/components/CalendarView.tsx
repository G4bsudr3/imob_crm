import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { AppointmentWithLead } from '../hooks/useAppointments'
import { cn } from '../lib/utils'

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const STATUS_CHIP: Record<string, string> = {
  agendado: 'bg-primary text-primary-foreground',
  confirmado: 'bg-success text-white',
  cancelado: 'bg-destructive/60 text-white',
  realizado: 'bg-muted-foreground/60 text-white',
}

function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dateKey(isoStr: string): string {
  return isoDate(new Date(isoStr))
}

function timeStr(isoStr: string): string {
  const d = new Date(isoStr)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function groupByDate(appointments: AppointmentWithLead[]): Record<string, AppointmentWithLead[]> {
  const m: Record<string, AppointmentWithLead[]> = {}
  for (const a of appointments) {
    const k = dateKey(a.scheduled_at)
    ;(m[k] ??= []).push(a)
  }
  for (const k of Object.keys(m)) {
    m[k].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
  }
  return m
}

interface CalendarViewProps {
  appointments: AppointmentWithLead[]
  view: 'month' | 'week'
  onDateClick: (dateTimeStr: string) => void
}

export function CalendarView({ appointments, view, onDateClick }: CalendarViewProps) {
  const [cursor, setCursor] = useState(new Date())
  const byDate = useMemo(() => groupByDate(appointments), [appointments])
  const todayKey = isoDate(new Date())

  function handleDayClick(d: Date) {
    onDateClick(`${isoDate(d)}T09:00`)
  }

  // ── Month view ──────────────────────────────────────────────────────────────
  if (view === 'month') {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstDow = new Date(year, month, 1).getDay()
    const totalDays = new Date(year, month + 1, 0).getDate()

    const cells: Array<{ date: Date; current: boolean }> = []
    for (let i = firstDow - 1; i >= 0; i--) cells.push({ date: new Date(year, month, -i), current: false })
    for (let d = 1; d <= totalDays; d++) cells.push({ date: new Date(year, month, d), current: true })
    let nd = 1
    while (cells.length < 42) cells.push({ date: new Date(year, month + 1, nd++), current: false })

    return (
      <div className="border border-border rounded-xl overflow-hidden bg-background">
        <CalHeader
          label={`${MONTHS_PT[month]} ${year}`}
          onPrev={() => setCursor(new Date(year, month - 1, 1))}
          onNext={() => setCursor(new Date(year, month + 1, 1))}
          onToday={() => setCursor(new Date())}
        />
        <div className="grid grid-cols-7 border-b border-border bg-subtle">
          {DAYS_PT.map((d) => (
            <div key={d} className="py-2 text-center text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 border-l border-border">
          {cells.map(({ date, current }, idx) => {
            const key = isoDate(date)
            const appts = byDate[key] ?? []
            const isToday = key === todayKey
            const MAX = 3

            return (
              <div
                key={idx}
                onClick={() => handleDayClick(date)}
                className={cn(
                  'min-h-[96px] p-1.5 border-r border-b border-border cursor-pointer group hover:bg-subtle/60 transition-colors',
                  !current && 'bg-subtle/30',
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={cn(
                    'w-6 h-6 flex items-center justify-center rounded-full text-xs font-semibold',
                    isToday && 'bg-primary text-primary-foreground',
                    !isToday && current && 'text-foreground',
                    !isToday && !current && 'text-muted-foreground/40',
                  )}>
                    {date.getDate()}
                  </span>
                  <Plus size={11} className="text-muted-foreground/0 group-hover:text-muted-foreground/50 transition-colors" />
                </div>
                <div className="space-y-0.5">
                  {appts.slice(0, MAX).map((a) => (
                    <div
                      key={a.id}
                      onClick={(e) => e.stopPropagation()}
                      title={`${timeStr(a.scheduled_at)} — ${a.leads?.name ?? 'Sem nome'}${a.properties ? ` · ${a.properties.title}` : ''}`}
                      className={cn(
                        'text-[10px] px-1.5 py-0.5 rounded truncate font-medium leading-tight',
                        STATUS_CHIP[a.status] ?? STATUS_CHIP.agendado,
                      )}
                    >
                      {timeStr(a.scheduled_at)} {a.leads?.name ?? '—'}
                    </div>
                  ))}
                  {appts.length > MAX && (
                    <div className="text-[10px] text-muted-foreground px-1">+{appts.length - MAX} mais</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Week view ───────────────────────────────────────────────────────────────
  const weekStart = new Date(cursor)
  weekStart.setDate(weekStart.getDate() - weekStart.getDay())
  weekStart.setHours(0, 0, 0, 0)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  const [w0, w6] = [weekDays[0], weekDays[6]]
  const weekLabel =
    w0.getMonth() === w6.getMonth()
      ? `${w0.getDate()} – ${w6.getDate()} ${MONTHS_PT[w0.getMonth()]} ${w0.getFullYear()}`
      : `${w0.getDate()} ${MONTHS_PT[w0.getMonth()].slice(0, 3)} – ${w6.getDate()} ${MONTHS_PT[w6.getMonth()].slice(0, 3)} ${w6.getFullYear()}`

  function shiftWeek(n: number) {
    const d = new Date(cursor)
    d.setDate(d.getDate() + n * 7)
    setCursor(d)
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background">
      <CalHeader
        label={weekLabel}
        onPrev={() => shiftWeek(-1)}
        onNext={() => shiftWeek(1)}
        onToday={() => setCursor(new Date())}
      />
      <div className="grid grid-cols-7 divide-x divide-border border-b border-border">
        {weekDays.map((day, i) => {
          const key = isoDate(day)
          const appts = byDate[key] ?? []
          const isToday = key === todayKey

          return (
            <div key={i} className="flex flex-col min-h-[340px]">
              {/* Day header */}
              <div
                onClick={() => handleDayClick(day)}
                className={cn(
                  'py-2.5 text-center border-b border-border cursor-pointer hover:bg-subtle transition-colors group',
                  isToday && 'bg-primary-soft',
                )}
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-0.5">
                  {DAYS_PT[day.getDay()]}
                </div>
                <div className={cn(
                  'text-lg font-bold leading-none',
                  isToday ? 'text-primary' : 'text-foreground',
                )}>
                  {day.getDate()}
                </div>
                {appts.length > 0 && (
                  <div className="text-[10px] text-muted-foreground mt-0.5">{appts.length} visita{appts.length !== 1 ? 's' : ''}</div>
                )}
              </div>

              {/* Events */}
              <div className="flex-1 p-1.5 space-y-1 overflow-y-auto">
                {appts.map((a) => (
                  <div
                    key={a.id}
                    className={cn(
                      'rounded-lg p-2 text-[10px] leading-tight font-medium',
                      STATUS_CHIP[a.status] ?? STATUS_CHIP.agendado,
                    )}
                  >
                    <div className="font-bold text-[11px]">{timeStr(a.scheduled_at)}</div>
                    <div className="truncate mt-0.5">{a.leads?.name ?? 'Sem nome'}</div>
                    {a.properties && (
                      <div className="truncate opacity-75 mt-0.5">{a.properties.title}</div>
                    )}
                  </div>
                ))}
                {appts.length === 0 && (
                  <button
                    onClick={() => handleDayClick(day)}
                    className="w-full h-full min-h-[40px] flex items-center justify-center text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors"
                  >
                    <Plus size={16} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CalHeader({
  label, onPrev, onNext, onToday,
}: {
  label: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-subtle">
      <div className="flex items-center gap-1">
        <button onClick={onPrev} className="p-1.5 rounded-lg hover:bg-background transition-colors">
          <ChevronLeft size={16} className="text-muted-foreground" />
        </button>
        <button onClick={onNext} className="p-1.5 rounded-lg hover:bg-background transition-colors">
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
      </div>
      <span className="text-sm font-semibold tracking-tight">{label}</span>
      <button
        onClick={onToday}
        className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1 hover:bg-background transition-colors"
      >
        Hoje
      </button>
    </div>
  )
}
