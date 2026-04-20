import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Appointment } from '../types/database'
import { useProfile } from './useProfile'

export type AppointmentWithLead = Appointment & {
  leads: { name: string | null; phone: string; assigned_to: string | null } | null
  properties: { title: string; location: string } | null
}

const POLL_INTERVAL_MS = 30_000

export function useAppointments() {
  const { profile } = useProfile()
  const orgId = profile?.organization_id ?? null
  const [appointments, setAppointments] = useState<AppointmentWithLead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchAppointments = useCallback(async () => {
    if (!orgId) {
      setAppointments([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error: qErr } = await supabase
      .from('appointments')
      .select('*, leads(name, phone, assigned_to), properties(title, location)')
      .eq('organization_id', orgId)
      .order('scheduled_at', { ascending: true })
    if (qErr) {
      console.error('[useAppointments] fetch error:', qErr.message)
      setError(qErr.message)
    } else {
      setError(null)
      setAppointments((data as AppointmentWithLead[]) ?? [])
    }
    setLoading(false)
  }, [orgId])

  async function updateStatus(id: string, status: string) {
    const prev = appointments
    setAppointments((curr) => curr.map((a) => (a.id === id ? { ...a, status } : a)))
    const { error } = await supabase.from('appointments').update({ status }).eq('id', id)
    if (error) setAppointments(prev)
    return error
  }

  async function createAppointment(input: {
    lead_id: string
    property_id: string | null
    scheduled_at: string
    notes: string | null
  }) {
    if (!orgId) return { message: 'Usuário sem organização' } as { message: string }
    const { error } = await supabase.from('appointments').insert({
      lead_id: input.lead_id,
      property_id: input.property_id,
      scheduled_at: input.scheduled_at,
      notes: input.notes,
      status: 'agendado',
      organization_id: orgId,
    })
    if (!error) fetchAppointments()
    return error
  }

  useEffect(() => { fetchAppointments() }, [fetchAppointments])

  // Realtime subscription for live updates
  useEffect(() => {
    if (!orgId) return
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }
    const channel = supabase
      .channel(`appointments-${orgId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `organization_id=eq.${orgId}` },
        () => { fetchAppointments() },
      )
      .subscribe()
    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [orgId, fetchAppointments])

  // Polling fallback: realtime postgres_changes with nested-subquery RLS policies
  // can silently drop events. A 30s poll guarantees eventual consistency.
  useEffect(() => {
    if (!orgId) return
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(() => { fetchAppointments() }, POLL_INTERVAL_MS)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [orgId, fetchAppointments])

  return { appointments, loading, error, refetch: fetchAppointments, updateStatus, createAppointment }
}
