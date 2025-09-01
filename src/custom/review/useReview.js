// custom/review/useReview.js
import { useEffect, useRef, useState } from 'react'
import Select from 'ol/interaction/Select'
import DragBox from 'ol/interaction/DragBox'
import { platformModifierKeyOnly, shiftKeyOnly, click } from 'ol/events/condition'
import Style from 'ol/style/Style'
import Stroke from 'ol/style/Stroke'

// inject once; keeps repo lean (no extra css file)
const ensureDragBoxStyle = () => {
  if (document.getElementById('review-dragbox-style')) return
  const style = document.createElement('style')
  style.id = 'review-dragbox-style'
  style.textContent = `
    .review-dragbox{
      border: 2px solid #2563eb;
      background-color: rgba(37,99,235,.12);
      box-sizing: border-box;
      pointer-events: none;
      position: absolute; /* just in case ol/ol.css isn't imported */
    }
  `
  document.head.appendChild(style)
}


const selectedStroke = new Style({ stroke: new Stroke({ color: '#1d4ed8', width: 2 }) })          // blue
const pendingStroke  = new Style({ stroke: new Stroke({ color: '#7c3aed', width: 2, lineDash: [4,4] }) }) // purple dashed

// Accept either Shift OR Ctrl/Cmd as the modifier
const modKey = (e) => platformModifierKeyOnly(e) || shiftKeyOnly(e)

function flattenLayers(groupOrLayer, out = []) {
  if (!groupOrLayer) return out
  const isGroup = typeof groupOrLayer.getLayers === 'function'
  if (!isGroup) { out.push(groupOrLayer); return out }
  groupOrLayer.getLayers().forEach(l => flattenLayers(l, out))
  return out
}

export default function useReview(map, { targetLayerTitle }) {
  const [reviewMode, setReviewMode] = useState(false)
  const [selectedCount, setSelectedCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)

  // state refs
  const selectedIds = useRef(new Set())
  const pending = useRef(new Map()) // id -> { is_portiek, review_status }
  const layerRef = useRef(null)
  const originalStyleRef = useRef(null)
  const selectRef = useRef(null)
  const boxRef = useRef(null)

  const refreshLayer = () => { layerRef.current?.changed?.() }

  // ---- style wrap / unwrap ---------------------------------------------------
  const wrapStyle = () => {
    const layer = layerRef.current
    if (!layer || originalStyleRef.current) return
    const orig = layer.getStyle()
    originalStyleRef.current = orig
    layer.setStyle((feature, res) => {
      let base = orig ? (typeof orig === 'function' ? orig(feature, res) : orig) : undefined
      const arr = base ? (Array.isArray(base) ? base.slice() : [base]) : []
      const id = feature.getId?.() ?? feature.get('id') ?? feature.get('fid')
      if (id != null) {
        if (selectedIds.current.has(id)) arr.push(selectedStroke)
        if (pending.current.has(id))     arr.push(pendingStroke)
      }
      return arr
    })
    layer.changed()
  }

  const unwrapStyle = () => {
    const layer = layerRef.current
    if (!layer || !originalStyleRef.current) return
    layer.setStyle(originalStyleRef.current)
    originalStyleRef.current = null
    layer.changed()
  }

  // ---- interactions on/off ---------------------------------------------------
  const enableInteractions = () => {
    const layer = layerRef.current
    if (!map || !layer) return
    ensureDragBoxStyle()

    // Select:
    // - plain click: single select (replace)
    // - Shift/Ctrl-click: toggle add/remove
    const sel = new Select({
      layers: [layer],
      condition: click,
      toggleCondition: modKey,
      multi: true,
      hitTolerance: 5,
    })

    // Keep our selectedIds in sync with the Select interaction's collection
    const syncFromSelect = () => {
      const ids = new Set()
      sel.getFeatures().forEach((f) => {
        const id = f.getId?.() ?? f.get('id') ?? f.get('fid')
        if (id != null) ids.add(id)
      })
      selectedIds.current = ids
      setSelectedCount(ids.size)
      refreshLayer()
    }

    sel.on('select', syncFromSelect)
    map.addInteraction(sel)
    selectRef.current = sel

    // DragBox: hold Shift OR Ctrl/Cmd and drag to add many (any direction)
    const box = new DragBox({ condition: modKey, className: 'review-dragbox' })
    box.on('boxend', () => {
      const extent = box.getGeometry().getExtent()
      const src = layer.getSource?.()
      if (!src) return

      // Build a fast lookup of what's already selected (by id)
      const selectedColl = sel.getFeatures()
      const have = new Set()
      selectedColl.forEach((f) => {
        const id = f.getId?.() ?? f.get('id') ?? f.get('fid')
        if (id != null) have.add(id)
      })

      // Add all features in extent to the Select interaction (not just our Set)
      src.forEachFeatureInExtent(extent, (f) => {
        // Optional: ensure geometry truly intersects the box
        // if (!f.getGeometry()?.intersectsExtent(extent)) return
        const id = f.getId?.() ?? f.get('id') ?? f.get('fid')
        if (id != null && !have.has(id)) {
          selectedColl.push(f)
          have.add(id)
        }
      })

      // Sync our mirror
      syncFromSelect()
    })
    map.addInteraction(box)
    boxRef.current = box
  }

  const disableInteractions = () => {
    if (selectRef.current) { map.removeInteraction(selectRef.current); selectRef.current = null }
    if (boxRef.current)    { map.removeInteraction(boxRef.current);    boxRef.current = null }
  }

  // ---- dynamic layer binding: re-scan when layers are added/removed ----------
  useEffect(() => {
    if (!map) return

    const findTarget = () => {
      const all = flattenLayers(map)
      return all.find(l => (l.get && (l.get('title') || l.get('name'))) === targetLayerTitle) || null
    }

    const rebindIfNeeded = () => {
      const current = layerRef.current
      const next = findTarget()
      if (current === next) return

      if (current) {
        disableInteractions()
        unwrapStyle()
      }

      layerRef.current = next

      if (reviewMode && next) {
        wrapStyle()
        enableInteractions()
      }
    }

    // run once now
    rebindIfNeeded()

    const coll = map.getLayers()
    const onAdd = () => rebindIfNeeded()
    const onRemove = () => rebindIfNeeded()
    coll.on('add', onAdd)
    coll.on('remove', onRemove)

    return () => {
      coll.un('add', onAdd)
      coll.un('remove', onRemove)
      if (layerRef.current) {
        disableInteractions()
        unwrapStyle()
      }
      layerRef.current = null
    }
  }, [map, targetLayerTitle, reviewMode])

  // ---- ESC to clear selection (when review mode is on) -----------------------
  useEffect(() => {
    if (!reviewMode) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        const sel = selectRef.current
        if (sel) sel.getFeatures().clear() // clears OL selection
        selectedIds.current.clear()
        setSelectedCount(0)
        refreshLayer()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reviewMode]) // only active during review mode

  // ---- public API ------------------------------------------------------------
  const start = () => {
    setReviewMode(true)
    if (layerRef.current) {
      wrapStyle()
      enableInteractions()
    }
  }

  const exit = () => {
    setReviewMode(false)
    disableInteractions()
    unwrapStyle()
    selectedIds.current.clear()
    pending.current.clear()
    setSelectedCount(0)
    setPendingCount(0)
  }

  const applyDecision = ({ payload }) => {
    if (!layerRef.current) return
    for (const id of selectedIds.current) {
      pending.current.set(id, payload)
    }
    setPendingCount(pending.current.size)
    refreshLayer()
  }

  const getBatch = () => {
    const layer = layerRef.current; if (!layer) return []
    const src = layer.getSource?.(); if (!src) return []
    const out = []
    src.getFeatures().forEach((f) => {
      const id = f.getId?.() ?? f.get('id') ?? f.get('fid')
      if (id == null) return
      const staged = pending.current.get(id); if (!staged) return
      const prev_version = f.get('version') ?? null
      out.push({ id, prev_version, ...staged })
    })
    return out
  }

  return { reviewMode, selectedCount, pendingCount, start, exit, applyDecision, getBatch }
}

