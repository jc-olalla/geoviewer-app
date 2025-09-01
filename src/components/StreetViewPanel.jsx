// src/components/StreetViewPanel.jsx
import { useContext, useEffect, useRef, useState, useMemo } from 'react'
import { MapContext } from '../context/MapContext'
import { toLonLat, fromLonLat } from 'ol/proj'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { Style, Circle as CircleStyle, Fill, Stroke } from 'ol/style'

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
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 50))
    if (g?.maps?.StreetViewPanorama && g.maps.StreetViewService) return g.maps
  }
  throw new Error('StreetView classes not available on google.maps')
}

export default function StreetViewPanel({ apiKey = DEFAULT_API_KEY, defaultOpen = true }) {
  const map = useContext(MapContext)
  const [open, setOpen] = useState(defaultOpen)
  const [enabled, setEnabled] = useState(true) // always-on by default
  const [status, setStatus] = useState('ready')
  const [hasAPI, setHasAPI] = useState(Boolean(window.google?.maps))

  const containerRef = useRef(null)
  const panoRef = useRef(null)
  const svServiceRef = useRef(null)

  // ---- marker layer (pin the pano position) ----
  const markerFeatureRef = useRef(null)
  const markerLayerRef = useRef(null)

  const markerStyle = useMemo(
    () =>
      new Style({
        image: new CircleStyle({
          radius: 6,
          fill: new Fill({ color: 'rgba(37,99,235,0.9)' }),
          stroke: new Stroke({ color: 'white', width: 2 }),
        }),
      }),
    []
  )

  useEffect(() => {
    if (!map) return
    const src = new VectorSource()
    const feat = new Feature({ geometry: new Point(fromLonLat([4.681, 51.798])) })
    feat.setStyle(markerStyle)
    src.addFeature(feat)

    const layer = new VectorLayer({ source: src, zIndex: 10000 })
    map.addLayer(layer)

    markerFeatureRef.current = feat
    markerLayerRef.current = layer

    return () => {
      if (layer) map.removeLayer(layer)
      markerFeatureRef.current = null
      markerLayerRef.current = null
    }
  }, [map, markerStyle])

  const updateMarker = (lng, lat) => {
    if (!markerFeatureRef.current) return
    markerFeatureRef.current.getGeometry().setCoordinates(fromLonLat([lng, lat]))
  }

  // DEV helpers (remove later)
  const exposeDev = () => {
    window.__pano = panoRef.current
    window.__svsvc = svServiceRef.current
  }

  // 1) Load API script (does not create panorama yet)
  useEffect(() => {
    if (!apiKey) return
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
  }, [apiKey])

  // 2) Create panorama once when API and container are ready (keep mounted)
  useEffect(() => {
    if (!hasAPI || !containerRef.current) return
    if (panoRef.current) return

    let cancelled = false
    ;(async () => {
      try {
        const gm = await ensureStreetViewReady()
        if (cancelled) return
        svServiceRef.current = new gm.StreetViewService()
        panoRef.current = new gm.StreetViewPanorama(containerRef.current, {
          position: { lat: 51.798, lng: 4.681 },
          pov: { heading: 0, pitch: 0 },
          zoom: 0,
          visible: open, // respect current open state
          motionTracking: false,
          linksControl: true,
          panControl: true,
          addressControl: false,
          fullscreenControl: false,
          zoomControl: true,
        })
        exposeDev()
        // Initial resize tick
        setTimeout(() => window.google.maps.event.trigger(panoRef.current, 'resize'), 0)
      } catch (e) {
        console.error('[StreetView] init failed', e)
        setStatus('street view not available')
      }
    })()

    return () => { cancelled = true }
  }, [hasAPI, open])

  // 3) Map click → update Street View (and pin) when enabled
  useEffect(() => {
    if (!map) return

    const onClick = (evt) => {
      if (!enabled) return
      if (!svServiceRef.current || !panoRef.current) return

      const [lon, lat] = toLonLat(evt.coordinate) // 3857 → lon/lat
      setStatus('locating…')
      const g = window.google
      const loc = new g.maps.LatLng(lat, lon)

      svServiceRef.current.getPanorama(
        { location: loc, radius: 200 },
        (data, statusCode) => {
          if (statusCode === g.maps.StreetViewStatus.OK) {
            const panoPos = data?.location?.latLng || loc
            const lng = panoPos.lng()
            const lat = panoPos.lat()

            panoRef.current.setVisible(true)
            panoRef.current.setPosition(panoPos)
            panoRef.current.setPano(data.location.pano)
            panoRef.current.setPov({ heading: 0, pitch: 0 })
            panoRef.current.setZoom(0)

            // update pin to the snapped pano location
            updateMarker(lng, lat)

            setTimeout(() => g.maps.event.trigger(panoRef.current, 'resize'), 200)
            setStatus(data.location.description || 'street view found')
          } else {
            // no coverage nearby—still center viewer & move pin to the click
            panoRef.current.setVisible(true)
            panoRef.current.setPosition(loc)
            updateMarker(lon, lat)
            setTimeout(() => g.maps.event.trigger(panoRef.current, 'resize'), 200)
            setStatus('no street view here')
          }
        }
      )
    }

    map.on('singleclick', onClick)
    return () => map.un('singleclick', onClick)
  }, [map, enabled])

  // 4) When panel is shown/hidden: keep container mounted, toggle visibility & fix sizing
  useEffect(() => {
    // If pano exists, sync its visibility with the panel and trigger a resize when shown
    if (panoRef.current) {
      panoRef.current.setVisible(open)
      if (open) {
        // two ticks: one immediate, one delayed, to help various browsers
        window.google.maps.event.trigger(panoRef.current, 'resize')
        setTimeout(() => window.google.maps.event.trigger(panoRef.current, 'resize'), 200)
      }
    }
  }, [open])

  return (
    <div style={wrapStyle}>
      <div style={headerStyle}>
        <strong>Street View</strong>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onClick={() => setEnabled(v => !v)}
            style={enabled ? btnPrimary : btn}
            title={enabled ? 'Click map to update Street View (click to pause)' : 'Paused — click to resume'}
            disabled={!hasAPI}
          >
            {enabled ? 'Listening to clicks' : 'Paused'}
          </button>
          <button onClick={() => setOpen(v => !v)} style={btn}>
            {open ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Keep the container mounted ALWAYS; just change its height */}
      <div
        ref={containerRef}
        style={{
          ...panoStyle,
          height: open ? 200 : 0,
          transition: 'height 120ms ease',
        }}
      >
        {/* empty: Google injects into this div */}
      </div>

      <div style={footerStyle}>{status}</div>
    </div>
  )
}

/* ---- tiny inline styles ---- */
const wrapStyle = {
  position: 'absolute',
  left: '0rem',
  top: '0.0rem',
  zIndex: 1000,
  width: 300,
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
const panoStyle = { width: '100%', height: 200, overflow: 'hidden' }
const footerStyle = { padding: '6px 10px', borderTop: '1px solid #e5e7eb', color: '#555' }
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

