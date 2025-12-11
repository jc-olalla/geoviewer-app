// components/LayerPanel.jsx
import { useEffect, useState, useContext, useMemo } from 'react'
import { MapContext } from '../context/MapContext'
import { LAYER_TYPES } from '../layers/layerTypes'
import { annotateLayer } from '../utils/annotateLayer'

import Style from 'ol/style/Style'
import Fill from 'ol/style/Fill'
import Stroke from 'ol/style/Stroke'

// helper: create a diagonal black hatch fill pattern
function createHatchFill() {
  const canvas = document.createElement('canvas')
  canvas.width = 8
  canvas.height = 8
  const ctx = canvas.getContext('2d')

  ctx.clearRect(0, 0, canvas.width, canvas.height)

  ctx.strokeStyle = 'rgba(0,0,0,0.6)' // black hatch lines (slightly transparent)
  ctx.lineWidth = 2

  ctx.beginPath()
  ctx.moveTo(0, 8)
  ctx.lineTo(8, 0)
  ctx.stroke()

  const patternFill = ctx.createPattern(canvas, 'repeat')

  // patternFill is used inside a Fill; if something goes wrong, fallback to semi-black
  return new Fill({ color: patternFill || 'rgba(0,0,0,0.3)' })
}

// BASE SOLID FILLS
const greenFill = new Fill({ color: 'rgba(16, 185, 129, 1)' })   // ja
const redFill = new Fill({ color: 'rgba(248, 113, 113, 1)' })    // nee
const yellowFill = new Fill({ color: 'rgba(250, 204, 21, 1)' })  // misschien

// STROKES (solid outlines)
const greenStroke = new Stroke({ color: '#16a34a', width: 1 })
const redStroke = new Stroke({ color: '#ef4444', width: 1 })
const yellowStroke = new Stroke({ color: '#eab308', width: 1 })

// PLAIN STYLES (solid color, no hatch)
const greenStyle = new Style({ fill: greenFill, stroke: greenStroke })
const redStyle = new Style({ fill: redFill, stroke: redStroke })
const yellowStyle = new Style({ fill: yellowFill, stroke: yellowStroke })

// SINGLE HATCH OVERLAY STYLE: transparent fill with black hatch pattern
const hatchOverlayStyle = new Style({
  fill: createHatchFill(), // will draw only the black diagonal lines
  // no stroke here – we keep the colored stroke from green/red/yellow styles
})

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

            // isPortiek=Ja  >> green / green + black hatch
            if (cat === 'ja') {
              return isDone
                ? [greenStyle, hatchOverlayStyle] // solid green + hatch
                : greenStyle
            }

            // isPortiek=Nee >> red / red + black hatch
            if (cat === 'nee') {
              return isDone
                ? [redStyle, hatchOverlayStyle]   // solid red + hatch
                : redStyle
            }

            // isPortiek=misschien >> yellow / yellow + black hatch
            if (cat === 'misschien') {
              return isDone
                ? [yellowStyle, hatchOverlayStyle] // solid yellow + hatch
                : yellowStyle
            }

            // fallback so buildings still show if value is unknown/missing
            return isDone
              ? [fallbackStyle, hatchOverlayStyle]
              : fallbackStyle
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
