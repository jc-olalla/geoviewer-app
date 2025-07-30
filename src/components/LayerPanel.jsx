import { useEffect, useState, useContext } from 'react'
import TileLayer from 'ol/layer/Tile'
import TileWMS from 'ol/source/TileWMS'
import { MapContext } from '../context/MapContext'

function LayerPanel() {
  const [layers, setLayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeLayers, setActiveLayers] = useState({})
  const map = useContext(MapContext)

  useEffect(() => {
    fetch('http://localhost:8000/layers/')
      .then(res => res.json())
      .then(data => {
        setLayers(data)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [])

  const handleLayerToggle = (layerData, isChecked) => {
    const version = layerData.version || '1.1.1'
    const layerId = layerData.id

    if (!map) return

    if (isChecked) {
      const wmsLayer = new TileLayer({
        source: new TileWMS({
          url: layerData.url,
          params: {
            LAYERS: layerData.layer_name,
            STYLES: '',
            FORMAT: layerData.format || 'image/png',
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
        opacity: layerData.opacity || 1.0,
      })

      map.addLayer(wmsLayer)
      setActiveLayers(prev => ({ ...prev, [layerId]: wmsLayer }))
    } else {
      const layer = activeLayers[layerId]
      if (layer) {
        map.removeLayer(layer)
        setActiveLayers(prev => {
          const copy = { ...prev }
          delete copy[layerId]
          return copy
        })
      }
    }
  }

  return (
    <div style={{
      position: 'absolute',
      top: '1rem',
      left: '1rem',
      background: 'white',
      padding: '1rem',
      borderRadius: '8px',
      maxHeight: '90vh',
      overflowY: 'auto',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      zIndex: 1000
    }}>
      <h3>Available Layers</h3>
      {loading && <p>Loading...</p>}
      {!loading && layers.map(layer => (
        <div key={layer.id}>
          <label>
            <input
              type="checkbox"
              onChange={(e) => handleLayerToggle(layer, e.target.checked)}
            />
            {layer.title || layer.name}
          </label>
        </div>
      ))}
    </div>
  )
}

export default LayerPanel

