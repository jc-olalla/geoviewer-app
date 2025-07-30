import { useContext, useEffect } from 'react'
import TileLayer from 'ol/layer/Tile'
import OSM from 'ol/source/OSM'
import { MapContext } from '../context/MapContext'

export default function BaseLayer() {
  const map = useContext(MapContext)

  useEffect(() => {
    if (!map) return

    const osm = new TileLayer({
      source: new OSM(),
    })

    map.addLayer(osm)
    console.log('Current layers in map:', map.getLayers().getArray())
    return () => map.removeLayer(osm)
  }, [map])

  return null
}

