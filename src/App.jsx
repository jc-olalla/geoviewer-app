// App.jsx
import { useState, useEffect } from 'react'
import './App.css'
import MapContainer from './components/MapContainer'
import BaseLayer from './components/BaseLayer'
import LayerPanel from './components/LayerPanel'
import ReviewTool from './custom/review/ReviewTool'
import StreetViewPanel from './components/StreetViewPanel'
import { MapContext } from './context/MapContext'

// add:
import IdentifyManager from './identify/IdentifyManager'
import makePopupRenderer from './identify/popupRenderer'

function App() {
  const [map, setMap] = useState(null)

  useEffect(() => {
    if (!map) return
    window.map = map // for dev only
    // attach once when map becomes available
    const render = makePopupRenderer(map) // popup UI
    const identify = new IdentifyManager(map, { render, hitTolerance: 5 })
    identify.start()
    return () => identify.stop()
  }, [map])

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <MapContainer onMapReady={setMap} />
      {map && (
        <MapContext.Provider value={map}>
          <BaseLayer />
          <LayerPanel />
          <ReviewTool />
          <StreetViewPanel />
        </MapContext.Provider>
      )}
    </div>
  )
}

export default App

