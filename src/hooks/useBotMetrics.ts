import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from './useProfile'

export type DailyPoint = {
  date: string // ISO YYYY-MM-DD
  label: string // ex: "17/04"
  msgsIn: number
  msgsOut: number
  tokens: number
}

export type BotMetrics = {
  leadsCaptured: number
  messagesIn: number
  messagesOut: number
  aiResponses: number
  tokensUsed: number
  appointmentsCreated: number
  escalationsCount: number
  estimatedCostBRL: number
  daily: DailyPoint[]
}

const COST_PER_1K_TOKENS_BRL = 0.01

function dateKey(iso: string): string {
  // YYYY-MM-DD in local time
  const d = new Date(iso)
  return d.toISOString().slice(0, 10)
}

function buildDailySeries(
  days: number,
  items: Array<{ sent_at: string; direction: string; ai_tokens_used: number | null }>,
): DailyPoint[] {
  const map = new Map<string, DailyPoint>()
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    map.set(key, { date: key, label, msgsIn: 0, msgsOut: 0, tokens: 0 })
  }
  for (const item of items) {
    const key = dateKey(item.sent_at)
    const p = map.get(key)
    if (!p) continue
    if (item.direction === 'in') p.msgsIn += 1
    else p.msgsOut += 1
    p.tokens += item.ai_tokens_used ?? 0
  }
  return Array.from(map.values())
}

export function useBotMetrics(daysBack = 7) {
  const { profile } = useProfile()
  const orgId = profile?.organization_id ?? null
  const [metrics, setMetrics] = useState<BotMetrics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) {
      setLoading(false)
      return
    }
    const since = new Date(Date.now() - daysBack * 86_400_000).toISOString()

    async function load() {
      setLoading(true)
      const [leadsRes, apptsRes, convRes] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId!).eq('source', 'whatsapp').gte('created_at', since),
        supabase.from('appointments').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId!).gte('created_at', since),
        supabase.from('conversations')
          .select('sent_at, direction, ai_tokens_used, ai_tool_used')
          .eq('organization_id', orgId!).gte('sent_at', since)
          .order('sent_at', { ascending: true }),
      ])

      const rows = convRes.data ?? []
      const msgsIn = rows.filter((r) => r.direction === 'in').length
      const msgsOut = rows.filter((r) => r.direction === 'out').length
      const aiResponses = rows.filter((r) => r.ai_tokens_used != null).length
      const tokens = rows.reduce((s, r) => s + (r.ai_tokens_used ?? 0), 0)
      const escalations = rows.filter((r) => r.ai_tool_used === 'escalate_to_human').length

      setMetrics({
        leadsCaptured: leadsRes.count ?? 0,
        messagesIn: msgsIn,
        messagesOut: msgsOut,
        aiResponses,
        tokensUsed: tokens,
        appointmentsCreated: apptsRes.count ?? 0,
        escalationsCount: escalations,
        estimatedCostBRL: (tokens / 1000) * COST_PER_1K_TOKENS_BRL,
        daily: buildDailySeries(daysBack, rows),
      })
      setLoading(false)
    }

    load()
  }, [orgId, daysBack])

  return { metrics, loading }
}
