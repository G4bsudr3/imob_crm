import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'
import { useAuth } from './useAuth'

type ProfileContextValue = {
  profile: Profile | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
  upsertProfile: (patch: Partial<Profile>) => Promise<{ error: string | null }>
  hasOrg: boolean
}

const ProfileContext = createContext<ProfileContextValue | null>(null)

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProfile = useCallback(async () => {
    if (!user) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle()
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    // If profile has no org, try to accept any pending invitation for this email
    if (data && !data.organization_id) {
      const { data: acceptedOrgId } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: string | null }>)('accept_pending_invitation')
      if (acceptedOrgId) {
        const { data: refreshed } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle()
        setProfile(refreshed)
        setLoading(false)
        return
      }
    }

    // Defensive: se temos sessão mas NAO existe profile, verifica se o user ainda
    // existe em auth.users. Se nao existe (sessao stale apos db wipe), forca logout
    // pra evitar loops de FK violation em inserts subsequentes.
    if (!data && user.id) {
      const { data: authCheck, error: authErr } = await supabase.auth.getUser()
      if (authErr || !authCheck.user) {
        await supabase.auth.signOut()
        setProfile(null)
        setLoading(false)
        return
      }
    }

    setProfile(data)
    setLoading(false)
  }, [user])

  const upsertProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!user) return { error: 'no user' }
      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, ...patch }, { onConflict: 'id' })
      if (!error) await fetchProfile()
      return { error: error?.message ?? null }
    },
    [user, fetchProfile],
  )

  useEffect(() => { fetchProfile() }, [fetchProfile])

  return (
    <ProfileContext.Provider
      value={{
        profile,
        loading,
        error,
        refetch: fetchProfile,
        upsertProfile,
        hasOrg: !!profile?.organization_id,
      }}
    >
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>')
  return ctx
}
