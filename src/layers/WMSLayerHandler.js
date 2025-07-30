// src/layers/WMSLayerHandler.js
import TileLayer from 'ol/layer/Tile'
import TileWMS from 'ol/source/TileWMS'

export default class WMSLayerHandler {
  constructor(map, layerData) {
    this.map = map
    this.layerData = layerData
    this.layer = null
  }

  add() {
    const version = this.layerData.version || '1.1.1'

    this.layer = new TileLayer({
      source: new TileWMS({
        url: this.layerData.url,
        params: {
          LAYERS: this.layerData.layer_name,
          STYLES: '',
          FORMAT: this.layerData.format || 'image/png',
          TRANSPARENT: true,
          ...(version === '1.3.0'
            ? { CRS: 'EPSG:3857' }
            : { SRS: 'EPSG:3857' }),
          VERSION: version,
          TILED: true,
        },
        serverType: 'geoserver',
        crossOrigin: 'anonymous',
      }),
      opacity: this.layerData.opacity || 1.0,
    })

    this.map.addLayer(this.layer)
  }

  remove() {
    if (this.layer) {
      this.map.removeLayer(this.layer)
    }
  }
}

