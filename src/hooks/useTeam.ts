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
    // Re-convite: renova expires_at (7 dias) e limpa accepted_at. Sem isso, upsert nao refresh-ava a data.
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const { error } = await supabase
      .from('organization_invitations')
      .upsert(
        { organization_id: orgId, email: normalized, role, invited_by: profile?.id, expires_at: expiresAt, accepted_at: null } as any,
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
    // Ordem importa:
    // 1) Invalida TODOS os JWTs do usuario (senao ele continua com sessao valida ate expirar)
    // 2) Best-effort remove do grupo de alertas do WhatsApp
    // 3) Desvincula da org (organization_id=null, role=user)
    const member = members.find((m) => m.id === userId)
    const memberPhone = (member as unknown as { phone?: string | null })?.phone
    const { data: sess } = await supabase.auth.getSession()
    const token = sess.session?.access_token
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

    if (token) {
      // Revoke sessions (critico, bloqueia remocao se falhar)
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/admin-user-ops`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, apikey: anonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'revoke_sessions', user_id: userId }),
        })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          return { error: `Falha ao revogar sessao: ${j.error || res.status}` }
        }
      } catch (e) {
        return { error: `Falha ao revogar sessao: ${e instanceof Error ? e.message : String(e)}` }
      }

      // Kick do grupo WhatsApp (best-effort)
      if (memberPhone) {
        try {
          await fetch(`${supabaseUrl}/functions/v1/evolution-proxy`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, apikey: anonKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove_group_member', phone: memberPhone }),
          })
        } catch { /* ignora */ }
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
