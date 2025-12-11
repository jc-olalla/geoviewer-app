// components/LayerPanel.jsx
import { useEffect, useState, useContext, useMemo } from 'react'
import { MapContext } from '../context/MapContext'
import { LAYER_TYPES } from '../layers/layerTypes'
import { annotateLayer } from '../utils/annotateLayer'

import Style from 'ol/style/Style'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'

// styles for the new behavior
// is_portiek = 'ja'        -> green
// is_portiek = 'ja' & review_status='gedaan' -> green (hatched / dashed outline)
// is_portiek = 'nee'       -> red
// is_portiek = 'nee' & review_status='gedaan' -> red (hatched / dashed outline)
// is_portiek = 'misschien' -> yellow
// is_portiek = 'misschien' & review_status='gedaan' -> yellow (hatched / dashed outline)

const greenFill = new Fill({ color: 'rgba(16, 185, 129, 0.5)' })
const redFill = new Fill({ color: 'rgba(248, 113, 113, 0.5)' })
const yellowFill = new Fill({ color: 'rgba(250, 204, 21, 0.5)' })

const greenStroke = new Stroke({ color: '#16a34a', width: 1 })
const redStroke = new Stroke({ color: '#ef4444', width: 1 })
const yellowStroke = new Stroke({ color: '#eab308', width: 1 })

// plain color styles
const greenStyle = new Style({ fill: greenFill, stroke: greenStroke })
const redStyle = new Style({ fill: redFill, stroke: redStroke })
const yellowStyle = new Style({ fill: yellowFill, stroke: yellowStroke })

// "hatched" = same fill, but dashed border
const greenHatchedStyle = new Style({
  fill: greenFill,
  stroke: new Stroke({
    color: '#16a34a',
    width: 2,
    lineDash: [4, 4],
  }),
})

const redHatchedStyle = new Style({
  fill: redFill,
  stroke: new Stroke({
    color: '#ef4444',
    width: 2,
    lineDash: [4, 4],
  }),
})

const yellowHatchedStyle = new Style({
  fill: yellowFill,
  stroke: new Stroke({
    color: '#eab308',
    width: 2,
    lineDash: [4, 4],
  }),
})

// optional fallback style if is_portiek is unknown
const fallbackStyle = new Style({
  fill: new Fill({ color: 'rgba(148, 163, 184, 0.4)' }), // slate-ish
  stroke: new Stroke({ color: '#64748b', width: 1 }),
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
            // use the original field names
            const reviewRaw = feature.get('review_status')
            const isPortiekRaw = feature.get('is_portiek')

            const reviewStr = String(reviewRaw ?? '').trim().toLowerCase()
            const isDone = reviewStr === 'gedaan'

            const isPortiekStr = String(isPortiekRaw ?? '').trim().toLowerCase()

            // normalize is_portiek into one of: 'ja' | 'nee' | 'misschien'
            let cat = null
            if (
              isPortiekRaw === true ||
              ['ja', 'true', '1', 'y'].includes(isPortiekStr)
            ) {
              cat = 'ja'
            } else if (
              isPortiekRaw === false ||
              ['nee', 'false', '0', 'n'].includes(isPortiekStr)
            ) {
              cat = 'nee'
            } else if (['misschien'].includes(isPortiekStr)) {
              cat = 'misschien'
            }

            // isPortiek=Ja  >> green / green hatched
            if (cat === 'ja') {
              return isDone ? greenHatchedStyle : greenStyle
            }

            // isPortiek=Nee >> red / red hatched
            if (cat === 'nee') {
              return isDone ? redHatchedStyle : redStyle
            }

            // isPortiek=misschien >> yellow / yellow hatched
            if (cat === 'misschien') {
              return isDone ? yellowHatchedStyle : yellowStyle
            }

            // fallback so buildings still show if value is unknown/missing
            return fallbackStyle
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
