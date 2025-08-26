// geoviewer-app/src/identify/IdentifyManager.js
import GeoJSON from 'ol/format/GeoJSON'

export default class IdentifyManager {
  constructor(map, {
    render,                    // function(results, coordinate, pixel)
    hitTolerance = 5,
    defaultInfoFormat = 'application/json',
    dataProjection = 'EPSG:4326',     // typical for GeoJSON
    featureProjection = 'EPSG:3857',  // your map proj
  } = {}) {
    this.map = map
    this.render = render
    this.hitTolerance = hitTolerance
    this.defaultInfoFormat = defaultInfoFormat
    this.format = new GeoJSON({ dataProjection, featureProjection })
    this.enabled = true
    this._onClick = this._onClick.bind(this)
  }

  start() { this.map.on('singleclick', this._onClick) }
  stop()  { this.map.un('singleclick', this._onClick) }

  async _onClick(evt) {
    if (!this.enabled) return
    const coordinate = evt.coordinate
    const pixel = evt.pixel
    const view = this.map.getView()
    const resolution = view.getResolution()
    const projection = view.getProjection()

    // 1) Vector-like layers (includes WFS and your REST vectors)
    const vectorResults = []
    this.map.forEachFeatureAtPixel(pixel, (feature, layer) => {
      if (!layer?.getVisible?.()) return
      const cfg = layer.get?.('identify') || {}
      if (cfg.enabled === false) return
      const props = { ...feature.getProperties() }
      delete props.geometry
      vectorResults.push({ layer, feature, props, sourceType: 'vector' })
    }, { hitTolerance: this.hitTolerance })

    // 2) WMS layers via GetFeatureInfo
    const wmsPromises = []
    this.map.getLayers().forEach((layer) => {
      if (!layer?.getVisible?.()) return
      const src = layer.getSource?.()
      if (!src?.getFeatureInfoUrl) return

      const cfg = layer.get?.('identify') || {}
      if (cfg.enabled === false) return

      // Pick query layers & info format (can come from layer.set('identify', {...}))
      const infoFormat  = cfg.infoFormat || this.defaultInfoFormat
      const queryLayers = cfg.queryLayers || src.getParams?.()?.LAYERS
      if (!queryLayers) return

      const url = src.getFeatureInfoUrl(
        coordinate, resolution, projection,
        { INFO_FORMAT: infoFormat, QUERY_LAYERS: queryLayers }
      )
      if (!url) return

      wmsPromises.push(
        fetch(url)
          .then(r => r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)))
          .then(json => this._fromWmsJson(json, layer))
          .catch(() => [])
      )
    })

    const wmsResults = (await Promise.all(wmsPromises)).flat()
    const results = [...vectorResults, ...wmsResults]

    if (typeof this.render === 'function') {
      this.render(results, coordinate, pixel)
    } else {
      console.log('[Identify] results', results)
    }
  }

  _fromWmsJson(json, layer) {
    // Many servers return GeoJSON FeatureCollection or {features:[...]}
    const featuresArr = json?.type === 'FeatureCollection'
      ? json.features
      : (Array.isArray(json?.features) ? json.features : [])

    return featuresArr.map(f => {
      const feat = this.format.readFeature(f)
      const props = { ...feat.getProperties() }
      delete props.geometry
      return { layer, feature: feat, props, sourceType: 'wms' }
    })
  }
}

