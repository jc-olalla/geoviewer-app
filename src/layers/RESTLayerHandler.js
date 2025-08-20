// geoviewer-app/src/layers/RESTLayerHandler.js
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import GeoJSON from 'ol/format/GeoJSON'

/**
 * Minimal working REST layer for Supabase RPC + bbox
 * Dev-only: hard-coded bbox and refresh token.
 */
const SUPABASE_URL   = ''  // <- your project
const ANON_KEY       = ''                   // <- fill in
const REFRESH_TOKEN  = ''                        // <- fill in
const RPC_NAME       = 'features_in_bbox_3857'

// Hard-coded bbox in EPSG:3857 (from your cURL)
const BBOX_3857 = { minx: 467472, miny: 6742974, maxx: 563053, maxy: 6796760 }

export default class RESTLayerHandler {
  constructor(map /*, layerData */) {
    this.map = map
    this.layer = null

    // Assume GeoJSON is 4326; OL reprojects to map's 3857
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
    // Accept a FeatureCollection directly
    if (json && json.type === 'FeatureCollection' && Array.isArray(json.features)) {
      return json
    }
    // Or an array of rows with a geometry-like field
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
        Prefer: 'params=single-object', // ensures named JSON params bind correctly
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

