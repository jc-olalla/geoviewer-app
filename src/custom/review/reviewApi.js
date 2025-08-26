// custom/review/reviewApi.js
import { SUPABASE_URL, ANON_KEY, REFRESH_TOKEN } from './config'

// mint an access_token from a refresh_token (dev flow)
async function getAccessToken() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: REFRESH_TOKEN }),
  })
  if (!res.ok) throw new Error(`AUTH ${res.status}: ${await res.text()}`)
  const json = await res.json()
  if (!json.access_token) throw new Error('No access_token in response')
  return json.access_token
}

/**
 * Save a batch of edits.
 * batch := [{ id, prev_version, is_portiek, review_status }]
 * For now: one PATCH per row so we can include per-row version checks.
 * Later: replace with RPC for better performance and logging.
 */
export async function saveBatchPATCH(batch, { reviewer }) {
  if (!batch?.length) return { ok: true, updated: 0 }
  const token = await getAccessToken()

  let updated = 0
  const errors = []

  for (const item of batch) {
    const id = item.id
    const prev = item.prev_version
    const body = {
      is_portiek: item.is_portiek,
      review_status: item.review_status,
      reviewer,
      reviewed_at: new Date().toISOString(),
      // optionally bump version here if your table computes it via trigger; else omit
    }
    // prefer fid=eq.id if your PK column is fid; fall back to id if needed
    const qs = prev != null
      ? `fid=eq.${encodeURIComponent(id)}&version=eq.${encodeURIComponent(prev)}`
      : `fid=eq.${encodeURIComponent(id)}`

    const res = await fetch(`${SUPABASE_URL}/rest/v1/buildings?${qs}`, {
      method: 'PATCH',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      const rows = await res.json()
      if (Array.isArray(rows) && rows.length) updated += rows.length
    } else {
      const txt = await res.text()
      errors.push({ id, status: res.status, error: txt })
    }
  }

  return errors.length ? { ok: false, updated, errors } : { ok: true, updated }
}

