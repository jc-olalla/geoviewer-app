// custom/review/reviewApi.js
import { SUPABASE_URL, ANON_KEY, REFRESH_TOKEN } from './config'

// --- access token (dev flow) -------------------------------------------------
let TOKEN = { value: null, exp: 0 }
async function getAccessToken() {
  const now = Date.now()
  if (TOKEN.value && now < TOKEN.exp - 30_000) return TOKEN.value

  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: REFRESH_TOKEN }),
  })
  if (!res.ok) throw new Error(`AUTH ${res.status}: ${await res.text()}`)
  const json = await res.json()
  if (!json.access_token) throw new Error('No access_token in response')

  const ttl = (json.expires_in || 3600) * 1000
  TOKEN = { value: json.access_token, exp: now + ttl }
  return TOKEN.value
}

/**
 * Save a batch of edits via RPC:
 *   calls public.update_building_review(p_id, p_is_portiek, p_reviewer, p_note)
 *
 * batch := [{ id, prev_version?, is_portiek, note? }]
 * options := { reviewer }
 *
 * Returns: { ok, updated, rows, errors? }
 *   rows[i] ~= {
 *     out_fid, out_version, out_is_portiek, out_review_status,
 *     out_reviewer, out_reviewed_at
 *   }
 */
export async function saveBatchRPC(batch, { reviewer }) {
  if (!batch?.length) return { ok: true, updated: 0, rows: [] }

  const token = await getAccessToken()
  const rows = []
  const errors = []

  for (const item of batch) {
    const body = {
      p_id: Number(item.id),
      p_is_portiek: item.is_portiek ?? null,
      p_reviewer: reviewer,
      p_note: item.note ?? null,
    }

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/update_building_review`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // Prefer: 'return=representation' is not needed for RPC that RETURNS TABLE
      },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      // RPC that RETURNS TABLE comes back as an array (usually with 1 row)
      let out = null
      try { out = await res.json() } catch { out = null }
      const arr = Array.isArray(out) ? out : (out ? [out] : [])
      if (arr.length) rows.push(...arr)
    } else {
      errors.push({ id: item.id, status: res.status, error: await res.text() })
    }
  }

  // Use the number of returned rows as the count of successful updates
  const updated = rows.length
  return errors.length ? { ok: false, updated, rows, errors } : { ok: true, updated, rows }
}

