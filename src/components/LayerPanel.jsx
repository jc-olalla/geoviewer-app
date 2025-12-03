// components/LayerPanel.jsx
import { useEffect, useState, useContext, useMemo } from 'react'
import { MapContext } from '../context/MapContext'
import { LAYER_TYPES } from '../layers/layerTypes'
import { annotateLayer } from '../utils/annotateLayer'

import Style from 'ol/style/Style'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'

// styles for the new behavior
// - review_status is null/empty  -> orangeStyle
// - review_status is "gedaan" AND is_portiek=true -> greenStyle
// - all other cases -> not rendered (style function returns null)
const orangeStyle = new Style({
  fill: new Fill({ color: 'rgba(249, 115, 22, 0.5)' }), // orange-ish
  stroke: new Stroke({ color: '#f97316', width: 1 }),
})

const greenStyle = new Style({
  fill: new Fill({ color: 'rgba(16, 185, 129, 0.5)' }), // green-ish
  stroke: new Stroke({ color: '#10b981', width: 1 }),
})

function LayerPanel() {
  const map = useContext(MapContext)
  const [layers, setLayers] = useState([])
  const [activeLayers, setActiveLayers] = useState({})
  const [zoom, setZoom] = useState(() => map?.getView()?.getZoom?.() ?? 0)

  useEffect(() => {
    fetch('https://geoviewer-api.onrender.com/tenants/brandweer_zhz/layers/')
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
            const review = feature.get('review_status')
            const isPortiekRaw = feature.get('is_portiek')

            // normalize is_portiek to handle true, "ja", "true", etc.
            const isPortiek =
              isPortiekRaw === true ||
              String(isPortiekRaw ?? '').trim().toLowerCase() === 'ja' ||
              String(isPortiekRaw ?? '').trim().toLowerCase() === 'true'

            const reviewStr = review == null ? '' : String(review).trim().toLowerCase()
            const noReview = review == null || reviewStr === ''

            // 1) review_status is null/empty -> orange polygons
            if (noReview) {
              return orangeStyle
            }

            // 2) review_status is "gedaan" and is_portiek=true -> green polygons
            if (reviewStr === 'gedaan' && isPortiek) {
              return greenStyle
            }

            // 3) all other cases: don't show the feature
            return null
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

  // auto-activate layers whose metadata says `visible: true`
  useEffect(() => {
    if (!map || !layers.length) return

    layers.forEach((layer) => {
      const id = layer.id
      if (!layer.visible) return          // only auto-toggle visible layers
      if (activeLayers[id]) return        // already active

      const needsZoom = typeof layer.min_zoom === 'number' ? layer.min_zoom : layer.minZoom
      if (typeof needsZoom === 'number' && zoom < needsZoom) return // respect min_zoom

      handleToggle(layer, true)
    })
  }, [map, layers, activeLayers, zoom])

  return (
    <div style={{ position: 'absolute', top: '0rem', right: '0rem', background: 'white', padding: '0.5rem', zIndex: 1000 }}>
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
