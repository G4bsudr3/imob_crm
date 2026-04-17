import { useMemo, useState, type DragEvent } from 'react'
import { Phone, MessageCircle, Clock, Eye, Trash2 } from 'lucide-react'
import type { Lead } from '../types/database'
import { STATUS_LEAD_LABELS, STATUS_LEAD_VARIANTS, formatCurrency, formatDateShort, cn } from '../lib/utils'
import { Badge } from './ui/Badge'

const COLUMNS: { key: string; accent: string }[] = [
  { key: 'novo', accent: 'border-t-info' },
  { key: 'em_contato', accent: 'border-t-warning' },
  { key: 'agendado', accent: 'border-t-primary' },
  { key: 'convertido', accent: 'border-t-success' },
  { key: 'descartado', accent: 'border-t-destructive' },
]

type Props = {
  leads: Lead[]
  onStatusChange: (lead: Lead, status: string) => void
  onOpen: (lead: Lead) => void
  onDelete: (lead: Lead) => void
}

export function LeadsKanban({ leads, onStatusChange, onOpen, onDelete }: Props) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [hoverCol, setHoverCol] = useState<string | null>(null)

  const grouped = useMemo(() => {
    const map: Record<string, Lead[]> = {}
    for (const c of COLUMNS) map[c.key] = []
    for (const l of leads) {
      if (map[l.status]) map[l.status].push(l)
      else map[l.status] = [l]
    }
    return map
  }, [leads])

  function handleDragStart(e: DragEvent<HTMLDivElement>, lead: Lead) {
    setDragging(lead.id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', lead.id)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, colKey: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (hoverCol !== colKey) setHoverCol(colKey)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, colKey: string) {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || dragging
    setDragging(null)
    setHoverCol(null)
    if (!id) return
    const lead = leads.find((l) => l.id === id)
    if (!lead || lead.status === colKey) return
    onStatusChange(lead, colKey)
  }

  return (
    <div className="overflow-x-auto -mx-2 px-2 pb-2">
      <div className="flex gap-4 min-w-max">
        {COLUMNS.map((col) => {
          const items = grouped[col.key] ?? []
          const isHover = hoverCol === col.key
          return (
            <div
              key={col.key}
              onDragOver={(e) => handleDragOver(e, col.key)}
              onDragLeave={() => setHoverCol((c) => (c === col.key ? null : c))}
              onDrop={(e) => handleDrop(e, col.key)}
              className={cn(
                'w-[280px] shrink-0 rounded-xl border bg-subtle/40 border-border border-t-[3px] transition-colors',
                col.accent,
                isHover && 'bg-primary-soft/40 border-primary/40 ring-2 ring-primary/15',
              )}
            >
              <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-2 sticky top-0">
                <div className="flex items-center gap-2 min-w-0">
                  <Badge variant={STATUS_LEAD_VARIANTS[col.key]} dot>
                    {STATUS_LEAD_LABELS[col.key]}
                  </Badge>
                </div>
                <span className="text-[11px] font-medium text-muted-foreground tabular">
                  {items.length}
                </span>
              </div>

              <div className="p-2 space-y-2 min-h-[80px]">
                {items.length === 0 ? (
                  <div className="h-20 flex items-center justify-center text-[11px] text-muted-foreground border border-dashed border-border rounded-lg">
                    Arraste um lead pra cá
                  </div>
                ) : (
                  items.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      dragging={dragging === lead.id}
                      onDragStart={handleDragStart}
                      onDragEnd={() => {
                        setDragging(null)
                        setHoverCol(null)
                      }}
                      onOpen={onOpen}
                      onDelete={onDelete}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function LeadCard({
  lead,
  dragging,
  onDragStart,
  onDragEnd,
  onOpen,
  onDelete,
}: {
  lead: Lead
  dragging: boolean
  onDragStart: (e: DragEvent<HTMLDivElement>, lead: Lead) => void
  onDragEnd: () => void
  onOpen: (l: Lead) => void
  onDelete: (l: Lead) => void
}) {
  const initials = (lead.name ?? lead.phone).slice(0, 2).toUpperCase()
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      onDragEnd={onDragEnd}
      className={cn(
        'group bg-card border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing shadow-xs hover:shadow-card transition-all',
        dragging && 'opacity-40 rotate-[-1deg]',
      )}
    >
      <div className="flex items-start gap-2.5">
        <div className="h-8 w-8 shrink-0 rounded-full bg-primary-soft text-primary-soft-foreground flex items-center justify-center text-[11px] font-semibold">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-foreground truncate leading-tight">
            {lead.name ?? 'Sem nome'}
          </p>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Phone size={10} /> {lead.phone}
          </p>
        </div>
      </div>

      {(lead.property_type || lead.location_interest || lead.budget_max) && (
        <div className="mt-2.5 space-y-1 text-[11px] text-muted-foreground">
          {lead.property_type && (
            <p className="capitalize text-foreground/80">
              {lead.property_type}
              {lead.location_interest && <span className="text-muted-foreground"> · {lead.location_interest}</span>}
            </p>
          )}
          {lead.budget_max && (
            <p className="font-medium text-foreground tabular">
              até {formatCurrency(lead.budget_max)}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock size={10} /> {formatDateShort(lead.created_at)}
        </span>
        {lead.source === 'whatsapp' && (
          <span className="flex items-center gap-1 text-success">
            <MessageCircle size={10} /> WhatsApp
          </span>
        )}
      </div>

      <div className="mt-2.5 pt-2.5 border-t border-border flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onOpen(lead)
          }}
          className="flex-1 text-[11px] text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 py-1 rounded hover:bg-subtle"
        >
          <Eye size={11} /> Detalhes
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(lead)
          }}
          className="text-[11px] text-muted-foreground hover:text-destructive flex items-center justify-center p-1 rounded hover:bg-destructive-soft"
          title="Remover"
        >
          <Trash2 size={11} />
        </button>
      </div>
    </div>
  )
}
