import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from './useProfile'

export interface DashboardStats {
  totalLeads: number
  leadsNovos: number
  leadsNovosSemana: number
  leadsTrend: number // vs previous week (%)
  agendamentosHoje: number
  agendamentosProximos7d: number
  imoveisDisponiveis: number
  leadsPorStatus: { status: string; total: number }[]
  ultimosLeads: { id: string; name: string | null; phone: string; status: string; created_at: string }[]
  proximasVisitas: {
    id: string
    scheduled_at: string
    status: string
    lead_name: string | null
    lead_phone: string
    property_title: string | null
  }[]
}

export function useDashboard() {
  const { profile } = useProfile()
  const orgId = profile?.organization_id ?? null
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const load = useCallback(async () => {
    if (!orgId) { setLoading(false); return }
    setLoading(true)
      const hoje = new Date()
      const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).toISOString()
      const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1).toISOString()
      const inicioSemana = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const inicio2Semanas = new Date(hoje.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const fim7d = new Date(hoje.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

      const [leadsRes, novosSemana, novosSemanaAnterior, agendHoje, agendProximos, imoveisRes, ultimosRes, proximasRes] = await Promise.all([
        supabase.from('leads').select('status'),
        supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', inicioSemana),
        supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', inicio2Semanas).lt('created_at', inicioSemana),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).gte('scheduled_at', inicioHoje).lt('scheduled_at', fimHoje).neq('status', 'cancelado'),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).gte('scheduled_at', inicioHoje).lt('scheduled_at', fim7d).neq('status', 'cancelado'),
        supabase.from('properties').select('id', { count: 'exact', head: true }).eq('available', true),
        supabase.from('leads').select('id, name, phone, status, created_at').order('created_at', { ascending: false }).limit(5),
        supabase
          .from('appointments')
          .select('id, scheduled_at, status, leads(name, phone), properties(title)')
          .gte('scheduled_at', inicioHoje)
          .neq('status', 'cancelado')
          .neq('status', 'realizado')
          .order('scheduled_at', { ascending: true })
          .limit(4),
      ])

      const leads = leadsRes.data ?? []
      const statusCount: Record<string, number> = {}
      for (const l of leads) {
        statusCount[l.status] = (statusCount[l.status] ?? 0) + 1
      }

      const novosEssaSemana = novosSemana.count ?? 0
      const novosSemanaPassada = novosSemanaAnterior.count ?? 0
      const trend = novosSemanaPassada === 0
        ? (novosEssaSemana > 0 ? 100 : 0)
        : Math.round(((novosEssaSemana - novosSemanaPassada) / novosSemanaPassada) * 100)

      setStats({
        totalLeads: leads.length,
        leadsNovos: statusCount['novo'] ?? 0,
        leadsNovosSemana: novosEssaSemana,
        leadsTrend: trend,
        agendamentosHoje: agendHoje.count ?? 0,
        agendamentosProximos7d: agendProximos.count ?? 0,
        imoveisDisponiveis: imoveisRes.count ?? 0,
        leadsPorStatus: Object.entries(statusCount).map(([status, total]) => ({ status, total })),
        ultimosLeads: (ultimosRes.data ?? []) as DashboardStats['ultimosLeads'],
        proximasVisitas: ((proximasRes.data ?? []) as any[]).map((a) => ({
          id: a.id,
          scheduled_at: a.scheduled_at,
          status: a.status,
          lead_name: a.leads?.name ?? null,
          lead_phone: a.leads?.phone ?? '',
          property_title: a.properties?.title ?? null,
        })),
      })
      setLoading(false)
  }, [orgId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!orgId) return
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    // Debounce reloads to avoid spam when many events burst in
    let timer: ReturnType<typeof setTimeout> | null = null
    const schedule = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { load() }, 600)
    }
    const channel = supabase
      .channel(`dashboard-${orgId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads', filter: `organization_id=eq.${orgId}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `organization_id=eq.${orgId}` }, schedule)
      .subscribe()
    channelRef.current = channel
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [orgId, load])

  return { stats, loading }
}
