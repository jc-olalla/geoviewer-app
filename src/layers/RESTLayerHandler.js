// geoviewer-app/src/layers/RESTLayerHandler.js
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import GeoJSON from 'ol/format/GeoJSON'

/**
 * Minimal working REST layer for Supabase RPC + bbox
 * Dev-only: hard-coded bbox and refresh token.
 */
const SUPABASE_URL   = 'https://dctmgvivsthofjcmejsd.supabase.co'  // <- your project
const ANON_KEY       = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjdG1ndml2c3Rob2ZqY21lanNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ5OTExNDksImV4cCI6MjA3MDU2NzE0OX0.YD_NNMkmvM3i-9HTuN4oqol3QZiMhrPlRq2g5CyTnf4' // <- fill in
const REFRESH_TOKEN  = 'hgngfuwstelw'                               // <- fill in
const RPC_NAME       = 'features_in_bbox_3857'

// Hard-coded bbox in EPSG:3857 (from your cURL)
const BBOX_3857 = { minx: 467472, miny: 6742974, maxx: 563053, maxy: 6796760 }

export default class RESTLayerHandler {
  constructor(map /*, layerData */) {
    this.map = map
    this.layer = null

    // Server returns GeoJSON in EPSG:4326; OL reprojects to map's 3857
    this.format = new GeoJSON({
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857',
    })
  }

  async _getAccessToken() {
    const url = `${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: REFRESH_TOKEN }),
    })
    if (!res.ok) {
      const t = await res.text()
      throw new Error(`[AUTH] ${res.status} ${t}`)
    }
    const json = await res.json()
    if (!json.access_token) throw new Error('[AUTH] Missing access_token in response')
    return json.access_token
  }

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

  async add() {
    const source = new VectorSource({ format: this.format })
    this.layer = new VectorLayer({ source, visible: true })
    this.map.addLayer(this.layer)

    try {
      const fc = await this._fetchOnce()
      const features = this.format.readFeatures(fc)

      // 🔑 Give each feature a stable id so selection/review works
      features.forEach((feat) => {
        // your data shows the PK in properties.id (fallback to fid if present)
        const pk = feat.get('id') ?? feat.get('fid')
        if (pk != null) feat.setId(String(pk)) // use String() to avoid bigint precision loss
      })

      source.clear(true)
      source.addFeatures(features)
      console.log(`[REST] Loaded ${features.length} features`)
    } catch (e) {
      console.error(e)
    }
  }

  remove() {
    if (this.layer) {
      this.map.removeLayer(this.layer)
      this.layer = null
    }
  }
}

