// admin-user-ops: admin/manager operations that need service_role on auth.users.
// Currently: revoke_sessions (invalidates ALL JWTs of a target user).
// Called by frontend BEFORE removing a member from the org, so the removed user
// cannot continue making requests with a cached JWT.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing authorization' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Valida caller via auth.users endpoint (token nao passa pelo JWT local; ES256).
    const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: supabaseAnonKey } })
    if (!userRes.ok) return jsonResponse({ error: 'Unauthorized' }, 401)
    const callerJson = await userRes.json() as { id?: string }
    const callerId = callerJson.id
    if (!callerId) return jsonResponse({ error: 'no caller id' }, 401)

    const admin = createClient(supabaseUrl, supabaseServiceKey)

    // Caller precisa ser admin/manager de alguma org
    const { data: callerProfile } = await admin.from('profiles').select('organization_id, role').eq('id', callerId).maybeSingle()
    if (!callerProfile?.organization_id) return jsonResponse({ error: 'Sem organizacao' }, 403)
    if (!['admin', 'manager'].includes(callerProfile.role)) return jsonResponse({ error: 'Apenas admin/manager' }, 403)

    const body = await req.json().catch(() => ({}))
    const action = body.action as string
    const targetUserId = body.user_id as string | undefined

    if (!targetUserId) return jsonResponse({ error: 'user_id obrigatorio' }, 400)
    if (targetUserId === callerId) return jsonResponse({ error: 'Nao pode operar sobre si mesmo' }, 400)

    // Target precisa estar na MESMA org que o caller (previne cross-org attack)
    const { data: targetProfile } = await admin.from('profiles').select('organization_id').eq('id', targetUserId).maybeSingle()
    if (!targetProfile) return jsonResponse({ error: 'Usuario nao encontrado' }, 404)
    if (targetProfile.organization_id !== callerProfile.organization_id) return jsonResponse({ error: 'Usuario de outra organizacao' }, 403)

    if (action === 'revoke_sessions') {
      // Invalida TODOS os JWTs do usuario (scope=global).
      const { error } = await admin.auth.admin.signOut(targetUserId, 'global')
      if (error) return jsonResponse({ error: `signOut falhou: ${error.message}` }, 500)
      return jsonResponse({ ok: true, revoked_user: targetUserId })
    }

    return jsonResponse({ error: 'Unknown action' }, 400)
  } catch (err) {
    console.error('[admin-user-ops] unhandled:', err)
    return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})
