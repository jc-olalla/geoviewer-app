// src/components/StreetViewPanel.jsx
import { useContext, useEffect, useRef, useState } from 'react'
import { MapContext } from '../context/MapContext'
import { toLonLat } from 'ol/proj'

// Read from Vite env (recommended) or pass as prop
const DEFAULT_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''

/** Load Google Maps JS API (works with old/new loaders). */
function loadGoogleMaps(apiKey) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve(window.google)
    const existing = document.querySelector('script[data-gmaps]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google))
      existing.addEventListener('error', reject)
      return
    }
    const s = document.createElement('script')
    // Use stable old-style URL (no importLibrary reliance). The async warning is harmless.
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=quarterly`
    s.async = true
    s.defer = true
    s.setAttribute('data-gmaps', '1')
    s.onload = () => resolve(window.google)
    s.onerror = reject
    document.head.appendChild(s)
  })
}

/** Wait until Street View classes are actually present (handles timing). */
async function ensureStreetViewReady() {
  const g = window.google
  if (g?.maps?.StreetViewPanorama && g.maps.StreetViewService) return g.maps
  // Retry a few times in case script just finished parsing
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 50))
    if (g?.maps?.StreetViewPanorama && g.maps.StreetViewService) return g.maps
  }
  throw new Error('StreetView classes not available on google.maps')
}

export default function StreetViewPanel({ apiKey = DEFAULT_API_KEY, defaultOpen = true }) {
  const map = useContext(MapContext)
  const [open, setOpen] = useState(defaultOpen)
  const [active, setActive] = useState(false)  // click-to-pick mode
  const [status, setStatus] = useState('ready')
  const [hasAPI, setHasAPI] = useState(Boolean(window.google?.maps))

  const containerRef = useRef(null)
  const panoRef = useRef(null)
  const svServiceRef = useRef(null)

  // DEV helpers (remove later)
  const exposeDev = () => {
    window.__pano = panoRef.current
    window.__svsvc = svServiceRef.current
  }

  // 1) Load API script (does not create panorama yet)
  useEffect(() => {
    if (!open || !apiKey) return
    let cancelled = false
    ;(async () => {
      try {
        await loadGoogleMaps(apiKey)
        if (cancelled) return
        setHasAPI(true)
      } catch (e) {
        console.error('[StreetView] API load failed', e)
        setStatus('failed to load API')
      }
    })()
    return () => { cancelled = true }
  }, [open, apiKey])

  // 2) Create panorama only after: open + API loaded + container exists
  useEffect(() => {
    if (!open || !hasAPI) return
    if (!containerRef.current) return
    if (panoRef.current) return

    let cancelled = false
    ;(async () => {
      try {
        const gm = await ensureStreetViewReady()
        if (cancelled) return
        svServiceRef.current = new gm.StreetViewService()
        panoRef.current = new gm.StreetViewPanorama(containerRef.current, {
          position: { lat: 52.0, lng: 5.0 }, // harmless default
          pov: { heading: 0, pitch: 0 },
          zoom: 0,
          visible: true,
          motionTracking: false,
          linksControl: true,
          panControl: true,
          addressControl: false,
          fullscreenControl: false,
          zoomControl: true,
        })
        exposeDev()
        // one resize tick so tiles render after the panel mounts
        setTimeout(() => window.google.maps.event.trigger(panoRef.current, 'resize'), 0)
      } catch (e) {
        console.error('[StreetView] init failed', e)
        setStatus('street view not available')
      }
    })()

    return () => { cancelled = true }
  }, [open, hasAPI])

  // 3) Map click → update Street View when "Pick from map" is active
  useEffect(() => {
    if (!map || !open) return

    const onClick = (evt) => {
      if (!active) return
      if (!svServiceRef.current || !panoRef.current) return
      const [lon, lat] = toLonLat(evt.coordinate) // 3857 → lon/lat
      setStatus('locating…')
      const g = window.google
      const loc = new g.maps.LatLng(lat, lon)

      svServiceRef.current.getPanorama(
        { location: loc, radius: 200 }, // ↑ wider radius helps coverage
        (data, statusCode) => {
          if (statusCode === g.maps.StreetViewStatus.OK) {
            panoRef.current.setVisible(true)
            const panoPos = data?.location?.latLng || loc
            panoRef.current.setPosition(panoPos)
            panoRef.current.setPano(data.location.pano) // id + position = safest
            panoRef.current.setPov({ heading: 0, pitch: 0 })
            panoRef.current.setZoom(0)
            // delayed resize after setting pano, some browsers need it
            setTimeout(() => g.maps.event.trigger(panoRef.current, 'resize'), 200)
            setStatus(data.location.description || 'street view found')
          } else {
            // no coverage nearby—still center viewer at click
            panoRef.current.setVisible(true)
            panoRef.current.setPosition(loc)
            setTimeout(() => g.maps.event.trigger(panoRef.current, 'resize'), 200)
            setStatus('no street view here')
          }
        }
      )
    }

    map.on('singleclick', onClick)
    return () => map.un('singleclick', onClick)
  }, [map, open, active])

  // 4) ESC to exit pick mode
  useEffect(() => {
    if (!active) return
    const onKey = (e) => { if (e.key === 'Escape') setActive(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active])

  return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <strong>Street View</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setActive((v) => !v)}
            style={active ? btnPrimary : btn}
            title="When active, click the map to update Street View (Esc to exit)"
            disabled={!hasAPI}
          >
            {active ? 'Picking… (Esc)' : 'Pick from map'}
          </button>
          <button onClick={() => setOpen((v) => !v)} style={btn}>
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {open && (
        <>
          {!apiKey ? (
            <div style={noticeStyle}>
              Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in your .env (or pass <code>apiKey</code>).
            </div>
          ) : !hasAPI ? (
            <div style={noticeStyle}>Loading Google Maps…</div>
          ) : (
            <div ref={containerRef} style={panoStyle} />
          )}
          <div style={footerStyle}>{status}</div>
        </>
      )}
    </div>
  )
}

/* ---- tiny inline styles ---- */
const wrapStyle = {
  position: 'absolute',
  right: '1rem',
  bottom: '1rem',
  zIndex: 1000,
  width: 420,
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: 8,
  boxShadow: '0 4px 16px rgba(0,0,0,.08)',
  overflow: 'hidden',
  font: '13px system-ui, sans-serif',
}
const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 10px',
  borderBottom: '1px solid #e5e7eb',
  background: '#f8fafc',
}
const panoStyle = { width: '100%', height: 300 }
const footerStyle = { padding: '6px 10px', borderTop: '1px solid #e5e7eb', color: '#555' }
const noticeStyle = { padding: 12, color: '#555' }
const btnBase = {
  font: '12px system-ui, sans-serif',
  padding: '6px 10px',
  borderRadius: 6,
  cursor: 'pointer',
  border: '1px solid #d1d5db',
  background: '#fff',
}
const btn = { ...btnBase }
const btnPrimary = { ...btnBase, background: '#2563eb', color: '#fff', borderColor: '#2563eb' }

