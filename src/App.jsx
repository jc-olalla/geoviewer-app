import { useEffect, useRef } from 'react'
import 'ol/ol.css'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import TileWMS from 'ol/source/TileWMS'

function App() {
  const mapElement = useRef(null)
  const mapInstance = useRef(null)

  useEffect(() => {
    if (mapInstance.current) return

    const osmLayer = new TileLayer({
      source: new OSM(),
    })

    const wmsLayer = new TileLayer({
      source: new TileWMS({
        url: 'https://service.pdok.nl/lv/bag/wms/v2_0', // Demo server
        params: {
          'LAYERS': 'pand',
          'STYLES': '',
          'TILED': true,
          'VERSION': '1.1.1',
          'FORMAT': 'image/png',
          'TRANSPARENT': true,
          'SRS': 'EPSG:3857',
        },
        serverType: 'geoserver',
        crossOrigin: 'anonymous', // Needed for public WMS layers
      }),
      opacity: 1.0,
    })

    mapInstance.current = new Map({
      target: mapElement.current,
      layers: [osmLayer, wmsLayer], // order matters: top to bottom
      view: new View({
        projection: 'EPSG:3857',
        center: [627486, 6862255],
        zoom: 12,
      }),
    })
  }, [])

  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <div ref={mapElement} style={{ height: '100%', width: '100%' }} />
    </div>
  )
}

export default App

