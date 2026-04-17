import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Appointment } from '../types/database'
import { useProfile } from './useProfile'

export type AppointmentWithLead = Appointment & {
  leads: { name: string | null; phone: string } | null
  properties: { title: string; location: string } | null
}

export function useAppointments() {
  const { profile } = useProfile()
  const orgId = profile?.organization_id ?? null
  const [appointments, setAppointments] = useState<AppointmentWithLead[]>([])
  const [loading, setLoading] = useState(true)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  async function fetchAppointments() {
    if (!orgId) {
      setAppointments([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('appointments')
      .select('*, leads(name, phone), properties(title, location)')
      .eq('organization_id', orgId)
      .order('scheduled_at', { ascending: true })
    setAppointments((data as AppointmentWithLead[]) ?? [])
    setLoading(false)
  }

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

  useEffect(() => { fetchAppointments() }, [orgId])

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
        () => {
          // Refetch mantém os joins (leads + properties) sincronizados
          fetchAppointments()
        },
      )
      .subscribe()
    channelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [orgId])

  return { appointments, loading, refetch: fetchAppointments, updateStatus, createAppointment }
}
