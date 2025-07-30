import { useEffect, useRef, useState } from 'react'
import Map from 'ol/Map'
import View from 'ol/View'

function MapContainer({ onMapReady }) {
  const mapRef = useRef(null)

  useEffect(() => {
    const map = new Map({
      target: mapRef.current,
      view: new View({
        center: [521098, 6763769],
        zoom: 18,
        projection: 'EPSG:3857',
      }),
      layers: [],
    })

    if (onMapReady) {
      onMapReady(map)
    }

    return () => map.setTarget(null)
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


