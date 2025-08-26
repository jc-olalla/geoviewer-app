// geoviewer-app/src/identify/popupRenderer.js
import Overlay from 'ol/Overlay'

export default function makePopupRenderer(map) {
  // lightweight overlay
  const el = document.createElement('div')
  el.className = 'ol-popup'
  el.innerHTML = `
    <button class="ol-popup-close" aria-label="Close">&times;</button>
    <div class="ol-popup-content"></div>
  `
  document.body.appendChild(el)

  const overlay = new Overlay({
    element: el,
    autoPan: { animation: { duration: 250 } },
    stopEvent: true,
  })
  map.addOverlay(overlay)
  el.querySelector('.ol-popup-close').addEventListener('click', () => overlay.setPosition(undefined))

  const esc = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

  const render = (results, coordinate) => {
    if (!results?.length) { overlay.setPosition(undefined); return }

    // Example: show the first result; you can expand to tabs/list later.
    const r = results[0]
    const layerTitle = r.layer?.get?.('title') || r.layer?.get?.('name') || 'Layer'

    const rows = Object.entries(r.props)
      .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
      .join('')

    el.querySelector('.ol-popup-content').innerHTML = `
      <div class="attr-head"><strong>${esc(layerTitle)}</strong></div>
      <table class="attr-table">${rows}</table>
      ${results.length > 1 ? `<div class="attr-note">${results.length-1} more hit(s) under cursor</div>` : ''}
    `
    overlay.setPosition(coordinate)
  }

  return render
}

