// components/LayerPanel.jsx
import { useEffect, useState, useContext, useMemo } from 'react'
import { MapContext } from '../context/MapContext'
import { LAYER_TYPES } from '../layers/layerTypes'
import { annotateLayer } from '../utils/annotateLayer'

import Style from 'ol/style/Style'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'

// base styles
const styleJa = new Style({
  fill:   new Fill({ color: 'rgba(16,185,129,0.35)' }),
  stroke: new Stroke({ color: '#10b981', width: 1 }),
})
const styleNee = new Style({
  fill:   new Fill({ color: 'rgba(239,68,68,0.25)' }),
  stroke: new Stroke({ color: '#ef4444', width: 1 }),
})
const styleDefault = new Style({
  fill:   new Fill({ color: 'rgba(107,114,128,0.20)' }),
  stroke: new Stroke({ color: '#6b7280', width: 1 }),
})

// dashed variants (used when review_status is null/empty)
const styleJaDashed = new Style({
  fill:   new Fill({ color: 'rgba(16,185,129,0.35)' }),
  stroke: new Stroke({ color: '#10b981', width: 1, lineDash: [4, 4] }),
})
const styleNeeDashed = new Style({
  fill:   new Fill({ color: 'rgba(239,68,68,0.25)' }),
  stroke: new Stroke({ color: '#ef4444', width: 1, lineDash: [4, 4] }),
})
const styleDefaultDashed = new Style({
  fill:   new Fill({ color: 'rgba(107,114,128,0.20)' }),
  stroke: new Stroke({ color: '#6b7280', width: 1, lineDash: [4, 4] }),
})

function LayerPanel() {
  const map = useContext(MapContext)
  const [layers, setLayers] = useState([])
  const [activeLayers, setActiveLayers] = useState({})
  const [zoom, setZoom] = useState(() => map?.getView()?.getZoom?.() ?? 0)

  useEffect(() => {
    fetch('http://localhost:8000/tenants/brandweer/layers/')
      .then(res => res.json())
      .then(setLayers)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!map) return
    const view = map.getView()
    const onZoom = () => setZoom(view.getZoom())
    view.on('change:resolution', onZoom)
    setZoom(view.getZoom())
    return () => view.un('change:resolution', onZoom)
  }, [map])

  const byId = useMemo(() => {
    const m = new Map()
    for (const l of layers) m.set(l.id, l)
    return m
  }, [layers])

  const handleToggle = (layerData, isChecked) => {
    const id = layerData.id
    const handlerType = layerData.type || 'wms'
    const HandlerClass = LAYER_TYPES[handlerType]

    if (!HandlerClass) {
      console.warn(`Unknown layer type: ${handlerType}`)
      return
    }

    if (isChecked) {
      if (activeLayers[id]) return

      const handler = new HandlerClass(map, layerData)
      handler.add()

      if (handler.layer) {
        annotateLayer(handler.layer, layerData)

        // Style only for REST/supabase_rest; remove guard to apply to other vector types too
        if (handlerType === 'rest' || handlerType === 'supabase_rest') {
          handler.layer.setStyle((feature) => {
            const v = String(feature.get('is_portiek') ?? '').trim().toLowerCase()
            const review = feature.get('review_status')
            const noReview = review == null || String(review).trim() === ''

            if (v === 'ja')  return noReview ? styleJaDashed  : styleJa
            if (v === 'nee') return noReview ? styleNeeDashed : styleNee
            return noReview ? styleDefaultDashed : styleDefault
          })
        }
      }

      setActiveLayers(prev => ({ ...prev, [id]: handler }))
    } else {
      const handler = activeLayers[id]
      if (handler) {
        handler.remove()
        setActiveLayers(prev => {
          const copy = { ...prev }
          delete copy[id]
          return copy
        })
      }
    }
  }

  return (
    <div style={{ position: 'absolute', top: '1rem', left: '1rem', background: 'white', padding: '1rem', zIndex: 1000 }}>
      <h3>Available Layers</h3>
      {layers.map(layer => {
        const isActive = !!activeLayers[layer.id]
        const needsZoom = typeof layer.min_zoom === 'number' ? layer.min_zoom : layer.minZoom
        const disabled = typeof needsZoom === 'number' ? zoom < needsZoom : false
        const title = layer.title || layer.name
        const tooltip = disabled ? `Zoom in to ${needsZoom}+ to activate` : ''

        return (
          <div key={layer.id}>
            <label title={tooltip}>
              <input
                type="checkbox"
                checked={isActive}
                disabled={disabled}
                onChange={(e) => handleToggle(layer, e.target.checked)}
              />
              {' '}
              {title}
            </label>
          </div>
        )
      })}
    </div>
  )
}

export default LayerPanel

