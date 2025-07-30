import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import GeoJSON from 'ol/format/GeoJSON'
import { bbox as bboxStrategy } from 'ol/loadingstrategy'

export default class WFSLayerHandler {
  constructor(map, layerData) {
    this.map = map
    this.layerData = layerData
    this.layer = null
  }

  buildWFSUrl(extent) {
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
    })

    return `${baseUrl}?${params.toString()}`
  }

  add() {
    const format = new GeoJSON({
      dataProjection: 'EPSG:3857',    // match WFS output
      featureProjection: 'EPSG:3857', // match map view
    })

    const source = new VectorSource({
      format,
      strategy: bboxStrategy,
      loader: async (extent, resolution, projection) => {
        const url = this.buildWFSUrl(extent)
        console.log('WFS request URL:', url)

        try {
          const response = await fetch(url)
          if (!response.ok) {
            throw new Error(`WFS fetch failed with status ${response.status}`)
          }

          const json = await response.json()

          const features = format.readFeatures(json)
          console.log(`Loaded ${features.length} features`)
          source.addFeatures(features)
        } catch (err) {
          console.error('Error loading WFS layer:', err)
        }
      },
    })

    this.layer = new VectorLayer({
      source,
      style: undefined, // use default styling for now
    })

    this.map.addLayer(this.layer)
  }

  remove() {
    if (this.layer) {
      this.map.removeLayer(this.layer)
    }
  }
}

