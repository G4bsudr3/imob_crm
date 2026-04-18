import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile, OrganizationInvitation } from '../types/database'
import { useProfile } from './useProfile'

export function useTeam() {
  const { profile } = useProfile()
  const orgId = profile?.organization_id ?? null

  const [members, setMembers] = useState<Profile[]>([])
  const [invitations, setInvitations] = useState<OrganizationInvitation[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!orgId) {
      setMembers([])
      setInvitations([])
      setLoading(false)
      return
    }
    setLoading(true)
    const [m, i] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true }),
      supabase
        .from('organization_invitations')
        .select('*')
        .eq('organization_id', orgId)
        .is('accepted_at', null)
        .order('created_at', { ascending: false }),
    ])
    setMembers(m.data ?? [])
    setInvitations(i.data ?? [])
    setLoading(false)
  }, [orgId])

  useEffect(() => { fetchAll() }, [fetchAll])

  async function invite(email: string, role: 'user' | 'manager' | 'admin') {
    if (!orgId) return { error: 'Sem organização' }
    const normalized = email.trim().toLowerCase()
    const { error } = await supabase
      .from('organization_invitations')
      .upsert(
        { organization_id: orgId, email: normalized, role, invited_by: profile?.id },
        { onConflict: 'organization_id,email' },
      )
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  async function revokeInvitation(id: string) {
    const { error } = await supabase.from('organization_invitations').delete().eq('id', id)
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  async function changeRole(userId: string, role: 'user' | 'manager' | 'admin') {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId)
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  async function removeMember(userId: string) {
    // Best-effort: remove do grupo de alertas do WhatsApp antes de desvincular da org.
    // Se falhar (telefone nao configurado, bot nao conectado, grupo nao criado, etc), segue mesmo assim.
    const member = members.find((m) => m.id === userId)
    const memberPhone = (member as unknown as { phone?: string | null })?.phone
    if (memberPhone) {
      try {
        const { data: sess } = await supabase.auth.getSession()
        const token = sess.session?.access_token
        if (token) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/evolution-proxy`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ action: 'remove_group_member', phone: memberPhone }),
          })
        }
      } catch {
        // ignora falha; nao bloqueia remocao do time
      }
    }
    const { error } = await supabase
      .from('profiles')
      .update({ organization_id: null, role: 'user' })
      .eq('id', userId)
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  return {
    members,
    invitations,
    loading,
    refetch: fetchAll,
    invite,
    revokeInvitation,
    changeRole,
    removeMember,
  }
}
