import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import GeoJSON from 'ol/format/GeoJSON'
import { bbox as bboxStrategy } from 'ol/loadingstrategy'

export default class WFSLayerHandler {
  constructor(map, layerData) {
    this.map = map
    this.layerData = layerData
    this.layer = null
    this.minZoom = layerData.minZoom || 14
    this.maxFeatures = layerData.maxFeatures || 1000
    this.format = new GeoJSON({
      dataProjection: 'EPSG:3857',
      featureProjection: 'EPSG:3857',
    })
  }

  buildWFSUrl(extent, startIndex = 0) {
    const baseUrl = this.layerData.url
    const typeName = this.layerData.layer_name

    const params = new URLSearchParams({
      service: 'WFS',
      version: '2.0.0',
      request: 'GetFeature',
      typeNames: typeName,
      outputFormat: 'application/json',
      srsName: 'EPSG:3857',
      bbox: extent.join(',') + ',EPSG:3857',
      startIndex: startIndex,
      count: this.maxFeatures,
    })

    return `${baseUrl}?${params.toString()}`
  }

  add() {
    const source = new VectorSource({
      format: this.format,
      strategy: bboxStrategy,
      loader: (extent, resolution, projection) => {
        const zoom = this.map.getView().getZoom()
        if (zoom < this.minZoom) {
          console.warn(`[WFS] Skipping load: zoom (${zoom}) < minZoom (${this.minZoom})`)
          return
        }

        const url = this.buildWFSUrl(extent, 0)

        fetch(url)
          .then(res => res.json())
          .then(json => {
            const features = this.format.readFeatures(json)
            console.log(`[WFS] Loaded ${features.length} features at zoom ${zoom}`)
            source.clear(true)
            source.addFeatures(features)
          })
          .catch(err => {
            console.error('WFS load error:', err)
          })
      },
    })

    this.layer = new VectorLayer({
      source,
      visible: false, // controlled externally
    })

    this.map.addLayer(this.layer)

    // Handle zoom threshold warning/activation
    const view = this.map.getView()
    const onZoom = () => {
      const zoom = view.getZoom()
      if (zoom >= this.minZoom) {
        this.layer.setVisible(true)
        console.log(`[WFS] Layer visible at zoom ${zoom}`)
      } else {
        this.layer.setVisible(false)
        console.warn(`[WFS] Layer hidden at zoom ${zoom}`)
      }
    }

    view.on('change:resolution', onZoom)
    onZoom() // run once on init
  }

  remove() {
    if (this.layer) {
      this.map.removeLayer(this.layer)
    }
  }
}

