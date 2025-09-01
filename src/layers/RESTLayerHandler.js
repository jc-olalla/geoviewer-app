// geoviewer-app/src/layers/RESTLayerHandler.js
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import GeoJSON from 'ol/format/GeoJSON'

/**
 * Minimal working REST layer for Supabase RPC + bbox
 * Dev-only: hard-coded bbox and refresh token.
 */
const SUPABASE_URL   = 'https://dctmgvivsthofjcmejsd.supabase.co'
const ANON_KEY       = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjdG1ndml2c3Rob2ZqY21lanNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5OTExNDksImV4cCI6MjA3MDU2NzE0OX0.YD_NNMkmvM3i-9HTuN4oqol3QZiMhrPlRq2g5CyTnf4'
const REFRESH_TOKEN  = 'hgngfuwstelw'
const RPC_NAME       = 'features_in_bbox_3857'

// Hard-coded bbox in EPSG:3857
const BBOX_3857 = { minx: 467472, miny: 6742974, maxx: 563053, maxy: 6796760 }

/* -------------------- simple caches -------------------- */
// Cache key: depends on RPC + bbox (adjust if you add filters)
const CACHE_KEY = `${RPC_NAME}:${BBOX_3857.minx},${BBOX_3857.miny},${BBOX_3857.maxx},${BBOX_3857.maxy}`

// Data cache stores plain GeoJSON FC (never OL Features)
const DATA_CACHE = new Map() // key -> { fc, fetchedAt, promise }

// Token cache with expiry
let TOKEN_CACHE = { accessToken: null, exp: 0 }

/* -------------------- handler -------------------- */
export default class RESTLayerHandler {
  constructor(map /*, layerData */) {
    this.map = map
    this.layer = null

    this.format = new GeoJSON({
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    })
  }

  /* ---------- tokens ---------- */
  async _getAccessToken() {
    const now = Date.now()
    if (TOKEN_CACHE.accessToken && now < TOKEN_CACHE.exp - 30_000) {
      return TOKEN_CACHE.accessToken
    }
    const url = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`
    const res = await fetch(url, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: REFRESH_TOKEN }),
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`[AUTH] ${res.status} ${t}`)
    }
    const json = await res.json()
    const token = json.access_token
    const ttlSec = json.expires_in || 3600
    if (!token) throw new Error('[AUTH] Missing access_token in response')

    TOKEN_CACHE = { accessToken: token, exp: now + ttlSec * 1000 }
    return token
  }

  /* ---------- fetch & convert ---------- */
  _toFeatureCollection(json) {
    if (json && json.type === 'FeatureCollection' && Array.isArray(json.features)) {
      return json
    }
    const rows = Array.isArray(json) ? json : []
    if (!rows.length) return { type: 'FeatureCollection', features: [] }

    const pickGeomField = (row) =>
      (row.geometry && 'geometry') ||
      (row.geom && 'geom') ||
      (row.geojson && 'geojson') ||
      'geometry'

    const gField = pickGeomField(rows[0])

    const features = rows.map((row) => {
      const geometry = row[gField]
      if (!geometry) return null
      const props = { ...row }
      delete props[gField]
      return { type: 'Feature', geometry, properties: props }
    }).filter(Boolean)

    return { type: 'FeatureCollection', features }
  }

  async _fetchOnce() {
    const accessToken = await this._getAccessToken()
    const url = `${SUPABASE_URL}/rest/v1/rpc/${RPC_NAME}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'params=single-object',
        Accept: 'application/json',
      },
      body: JSON.stringify(BBOX_3857),
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`[REST] ${res.status} ${t}`)
    }
    const json = await res.json()
    return this._toFeatureCollection(json)
  }

  /* ---------- data cache helpers ---------- */
  async _getFeatureCollectionCached({ force = false } = {}) {
    const entry = DATA_CACHE.get(CACHE_KEY)

    if (!force && entry?.fc) return entry.fc
    if (!force && entry?.promise) return entry.promise

    const promise = this._fetchOnce()
      .then((fc) => {
        DATA_CACHE.set(CACHE_KEY, { fc, fetchedAt: Date.now(), promise: null })
        return fc
      })
      .catch((err) => {
        // Clear broken promise so we can retry later
        if (DATA_CACHE.get(CACHE_KEY)?.promise) DATA_CACHE.delete(CACHE_KEY)
        throw err
      })

    DATA_CACHE.set(CACHE_KEY, { ...(entry || {}), promise })
    return promise
  }

  /* ---------- public API ---------- */

  /** Create layer (if needed) and show it. Loads from cache/network once. */
  async add() {
    // If already created, just show it
    if (this.layer) {
      this.layer.setVisible(true)
      return
    }

    const source = new VectorSource({ format: this.format })
    this.layer = new VectorLayer({ source, visible: true })
    this.map.addLayer(this.layer)

    try {
      const fc = await this._getFeatureCollectionCached()
      const features = this.format.readFeatures(fc)

      // Assign stable ids (string) for interaction
      features.forEach((feat) => {
        const pk = feat.get('id') ?? feat.get('fid')
        if (pk != null) feat.setId(String(pk))
      })

      source.addFeatures(features)
      console.log(`[REST] Loaded ${features.length} features (from ${DATA_CACHE.get(CACHE_KEY)?.fetchedAt ? 'cache' : 'network'})`)
    } catch (e) {
      console.error(e)
    }
  }

  /** Hide layer without destroying it (keeps features + cache). */
  hide() {
    if (this.layer) this.layer.setVisible(false)
  }

  /** Show layer if it exists; otherwise behaves like add(). */
  async show() {
    if (this.layer) {
      this.layer.setVisible(true)
      return
    }
    await this.add()
  }

  /** Remove layer from map (keeps in-memory data cache). */
  remove() {
    if (this.layer) {
      this.map.removeLayer(this.layer)
      this.layer = null
    }
  }

  /** Drop cached data and refetch on next show/add. */
  invalidateCache() {
    DATA_CACHE.delete(CACHE_KEY)
  }

  /** Force-refresh the layer data (re-download + repaint). */
  async forceRefresh() {
    this.invalidateCache()
    const fc = await this._getFeatureCollectionCached({ force: true })
    if (!this.layer) return
    const source = this.layer.getSource()
    const features = this.format.readFeatures(fc)

    features.forEach((feat) => {
      const pk = feat.get('id') ?? feat.get('fid')
      if (pk != null) feat.setId(String(pk))
    })

    source.clear(true)
    source.addFeatures(features)
  }
}

