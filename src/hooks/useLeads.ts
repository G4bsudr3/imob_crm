import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Lead } from '../types/database'
import { useProfile } from './useProfile'

const PAGE_SIZE = 80

export function useLeads() {
  const { profile } = useProfile()
  const orgId = profile?.organization_id ?? null
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  async function fetchLeads() {
    if (!orgId) {
      setLeads([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error, count } = await supabase
      .from('leads')
      .select('*', { count: 'exact' })
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)
    if (error) setError(error.message)
    else {
      setLeads(data ?? [])
      setHasMore((count ?? 0) > PAGE_SIZE)
    }
    setLoading(false)
  }

  async function loadMore() {
    if (!orgId || loadingMore) return
    setLoadingMore(true)
    const { data } = await supabase
      .from('leads')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .range(leads.length, leads.length + PAGE_SIZE - 1)
    setLeads((prev) => [...prev, ...(data ?? [])])
    setHasMore((data ?? []).length === PAGE_SIZE)
    setLoadingMore(false)
  }

  async function updateLeadStatus(id: string, status: string) {
    const prev = leads
    setLeads((curr) => curr.map((l) => (l.id === id ? { ...l, status } : l)))
    const { error } = await supabase.from('leads').update({ status }).eq('id', id)
    if (error) setLeads(prev)
    return error
  }

  async function deleteLead(id: string) {
    const prev = leads
    setLeads((curr) => curr.filter((l) => l.id !== id))
    const { error } = await supabase.from('leads').delete().eq('id', id)
    if (error) setLeads(prev)
    return error
  }

  async function updateLead(id: string, patch: Partial<Lead>) {
    const { error } = await supabase.from('leads').update(patch).eq('id', id)
    if (!error) fetchLeads()
    return error
  }

  useEffect(() => {
    fetchLeads()
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    const channel = supabase
      .channel(`leads-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leads', filter: `organization_id=eq.${orgId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setLeads((curr) => {
              if (curr.some((l) => l.id === (payload.new as Lead).id)) return curr
              return [payload.new as Lead, ...curr]
            })
          } else if (payload.eventType === 'UPDATE') {
            setLeads((curr) =>
              curr.map((l) => (l.id === (payload.new as Lead).id ? (payload.new as Lead) : l)),
            )
          } else if (payload.eventType === 'DELETE') {
            const old = payload.old as { id?: string }
            if (old.id) setLeads((curr) => curr.filter((l) => l.id !== old.id))
          }
        },
      )
      .subscribe()
    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [orgId])

  return { leads, loading, loadingMore, hasMore, error, refetch: fetchLeads, loadMore, updateLeadStatus, updateLead, deleteLead }
}
