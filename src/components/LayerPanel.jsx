import { useEffect, useState, useContext } from 'react'
import { MapContext } from '../context/MapContext'
import { LAYER_TYPES } from '../layers/layerTypes'

function LayerPanel() {
  const map = useContext(MapContext)
  const [layers, setLayers] = useState([])
  const [activeLayers, setActiveLayers] = useState({})

  useEffect(() => {
    fetch('http://localhost:8000/layers/')
      .then(res => res.json())
      .then(setLayers)
      .catch(() => {}) // handle error if needed
  }, [])

  const handleToggle = (layerData, isChecked) => {
    const id = layerData.id
    const handlerType = layerData.type || 'wms'
    const HandlerClass = LAYER_TYPES[handlerType]

    if (!HandlerClass) {
      console.warn(`Unknown layer type: ${handlerType}`)
      return
    }

    if (isChecked) {
      const handler = new HandlerClass(map, layerData)
      handler.add()
      setActiveLayers(prev => ({ ...prev, [id]: handler }))
    } else {
      const handler = activeLayers[id]
      if (handler) {
        handler.remove()
        const copy = { ...activeLayers }
        delete copy[id]
        setActiveLayers(copy)
      }
    }
  }

  return (
    <div style={{ position: 'absolute', top: '1rem', left: '1rem', background: 'white', padding: '1rem', zIndex: 1000 }}>
      <h3>Available Layers</h3>
      {layers.map(layer => (
        <div key={layer.id}>
          <label>
            <input
              type="checkbox"
              disabled={map.getView().getZoom() < layer.minZoom}
              title={`Zoom in to ${layer.minZoom}+ to activate`}
              onChange={(e) => handleToggle(layer, e.target.checked)}
            />
            {layer.title || layer.name}
          </label>
        </div>
      ))}
    </div>
  )
}

export default LayerPanel

