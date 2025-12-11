// components/LayerPanel.jsx
import { useEffect, useState, useContext, useMemo } from 'react'
import { MapContext } from '../context/MapContext'
import { LAYER_TYPES } from '../layers/layerTypes'
import { annotateLayer } from '../utils/annotateLayer'

import Style from 'ol/style/Style'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'

// helper: create a diagonal hatch fill pattern in a given color
function createHatchFill(color) {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 8
  const ctx = canvas.getContext('2d')

  // transparent background, colored diagonal line
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, 8)
  ctx.lineTo(8, 0)
  ctx.stroke()

  const pattern = ctx.createPattern(canvas, 'repeat')

  // Fallback: if pattern creation fails for some reason, use a solid color
  if (!pattern) {
    return new Fill({ color })
  }

  return new Fill({ color: pattern })
}

// BASE SOLID FILLS
const greenFill = new Fill({ color: 'rgba(16, 185, 129, 0.5)' })   // ja
const redFill = new Fill({ color: 'rgba(248, 113, 113, 0.5)' })    // nee
const yellowFill = new Fill({ color: 'rgba(250, 204, 21, 0.5)' })  // misschien

// STROKES (solid outlines)
const greenStroke = new Stroke({ color: '#16a34a', width: 1 })
const redStroke = new Stroke({ color: '#ef4444', width: 1 })
const yellowStroke = new Stroke({ color: '#eab308', width: 1 })

// PLAIN STYLES (no hatch)
const greenStyle = new Style({ fill: greenFill, stroke: greenStroke })
const redStyle = new Style({ fill: redFill, stroke: redStroke })
const yellowStyle = new Style({ fill: yellowFill, stroke: yellowStroke })

// HATCHED FILLS (used when review_status = 'gedaan')
const greenHatchFill = createHatchFill('#16a34a')
const redHatchFill = createHatchFill('#ef4444')
const yellowHatchFill = createHatchFill('#eab308')

// HATCHED STYLES: hatched interior + solid outline
const greenHatchedStyle = new Style({ fill: greenHatchFill, stroke: greenStroke })
const redHatchedStyle = new Style({ fill: redHatchFill, stroke: redStroke })
const yellowHatchedStyle = new Style({ fill: yellowHatchFill, stroke: yellowStroke })

// fallback style if is_portiek is unknown
const fallbackStyle = new Style({
  fill: new Fill({ color: 'rgba(148, 163, 184, 0.4)' }),
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
