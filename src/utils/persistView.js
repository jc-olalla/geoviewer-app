// src/map/persistView.js
import { toLonLat, fromLonLat } from 'ol/proj'

const STORAGE_KEY = 'map_view_v1'

// simple throttle
function throttle(fn, ms) {
  let t = 0, pending = null
  return (...args) => {
    const now = Date.now()
    if (now - t >= ms) { t = now; fn(...args) }
    else { pending && cancelAnimationFrame(pending); pending = requestAnimationFrame(() => { t = Date.now(); fn(...args) }) }
  }
}

function parseHash() {
  // supports "#z/lat/lon" or "#map=z/lat/lon"
  const h = (location.hash || '').replace(/^#/, '')
  const raw = h.startsWith('map=') ? h.slice(4) : h
  const parts = raw.split('/')
  if (parts.length !== 3) return null
  const [z, lat, lon] = parts.map(Number)
  if (!isFinite(z) || !isFinite(lat) || !isFinite(lon)) return null
  return { zoom: z, lat, lon }
}

function writeHash({ zoom, lat, lon }) {
  const z = Math.round(zoom * 10) / 10
  const s = `#${z}/${lat.toFixed(5)}/${lon.toFixed(5)}`
  // replaceState avoids polluting history while you pan
  history.replaceState(null, '', s)
}

function clampLat(lat) { return Math.max(-85, Math.min(85, lat)) } // web mercator
function clampLon(lon) { return ((lon + 180) % 360 + 360) % 360 - 180 }

export function restoreMapView(map) {
  const view = map.getView()
  // 1) URL hash wins
  const h = parseHash()
  if (h) {
    view.setCenter(fromLonLat([clampLon(h.lon), clampLat(h.lat)]))
    view.setZoom(h.zoom)
    return
  }
  // 2) localStorage fallback
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
    if (saved && isFinite(saved.zoom) && isFinite(saved.lat) && isFinite(saved.lon)) {
      view.setCenter(fromLonLat([clampLon(saved.lon), clampLat(saved.lat)]))
      view.setZoom(saved.zoom)
      if (isFinite(saved.rotation || 0)) view.setRotation(saved.rotation || 0)
    }
  } catch { /* ignore */ }
}

export function enableMapViewPersistence(map) {
  const view = map.getView()
  const save = throttle(() => {
    const center = view.getCenter()
    if (!center) return
    const [lon, lat] = toLonLat(center)
    const state = {
      lon: clampLon(lon),
      lat: clampLat(lat),
      zoom: view.getZoom(),
      rotation: view.getRotation() || 0,
    }
    // store
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch {}
    // reflect in URL (nice for reload/share)
    writeHash(state)
  }, 200)

  // save after map stops moving
  map.on('moveend', save)
  // also save just before unload, as a backup
  window.addEventListener('beforeunload', save)

  return () => {
    map.un('moveend', save)
    window.removeEventListener('beforeunload', save)
  }
}

