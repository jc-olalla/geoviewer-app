import { useState } from 'react'
import './App.css'
import MapContainer from './components/MapContainer'
import BaseLayer from './components/BaseLayer'
import LayerPanel from './components/LayerPanel'
import { MapContext } from './context/MapContext'

function App() {
  const [map, setMap] = useState(null)

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer onMapReady={setMap} />
      {map && (
        <MapContext.Provider value={map}>
          <BaseLayer />
          <LayerPanel />
        </MapContext.Provider>
      )}
    </div>
  )
}

export default App

