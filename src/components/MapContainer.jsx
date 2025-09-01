// src/components/MapContainer.jsx
import { useEffect, useRef } from 'react'
import Map from 'ol/Map'
import View from 'ol/View'
import { restoreMapView, enableMapViewPersistence } from '../utils/persistView'

function MapContainer({ onMapReady }) {
  const mapRef = useRef(null)

  useEffect(() => {
    const map = new Map({
      target: mapRef.current,
      view: new View({
        center: [521098, 6763769],  // default fallback; will be overridden by restoreMapView if saved/URL state exists
        zoom: 18,
        projection: 'EPSG:3857',
      }),
      layers: [],
    })

    // Restore last view (URL hash > localStorage)
    restoreMapView(map)
    // Start saving view on pan/zoom and before unload
    const disablePersist = enableMapViewPersistence(map)

    onMapReady?.(map)

    return () => {
      disablePersist?.()
      map.setTarget(null)
    }
  }, [onMapReady])

  return (
    <div
      ref={mapRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    />
  )
}

export default MapContainer

