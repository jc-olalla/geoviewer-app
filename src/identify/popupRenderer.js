// geoviewer-app/src/identify/popupRenderer.js
// Fixed bottom-right "Identify" panel (no OL Overlay)

export default function makePopupRenderer(/* map not needed for fixed panel */) {
  // create styles once
  const STYLE_ID = 'identify-fixed-panel-style'
  if (!document.getElementById(STYLE_ID)) {
    const css = `
      .identify-panel {
        position: fixed;
        left: 2px;
        bottom: 5px;
        width: min(260px, 92vw);
        max-height: 55vh;
        overflow: auto;
        background: #fff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        font: 13px system-ui, sans-serif;
        z-index: 1000; /* above map controls *
      }
      .identify-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 10px; border-bottom: 1px solid #e5e7eb; background: #f8fafc;
      }
      .identify-close {
        border: 1px solid #d1d5db; background: #fff; border-radius: 6px;
        padding: 2px 8px; cursor: pointer; font-size: 14px; line-height: 1;
      }
      .identify-body { padding: 10px; }
      .attr-table { width: 100%; border-collapse: collapse; }
      .attr-table th, .attr-table td { text-align: left; vertical-align: top; padding: 4px 6px; }
      .attr-table th { color: #374151; width: 35%; white-space: nowrap; }
      .attr-table tr:nth-child(odd) { background: #fafafa; }
      .attr-note { margin-top: 8px; color: #6b7280; font-size: 12px; }
    `.trim()
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = css
    document.head.appendChild(style)
  }

  // create panel once
  const el = document.createElement('div')
  el.className = 'identify-panel'
  el.style.display = 'none' // hidden until we have content
  el.innerHTML = `
    <div class="identify-header">
      <strong>Identify</strong>
      <button class="identify-close" aria-label="Close">×</button>
    </div>
    <div class="identify-body">
      <div class="attr-head"></div>
      <table class="attr-table"></table>
      <div class="attr-note" style="display:none"></div>
    </div>
  `
  document.body.appendChild(el)

  const closeBtn = el.querySelector('.identify-close')
  const headDiv = el.querySelector('.attr-head')
  const tableEl = el.querySelector('.attr-table')
  const noteDiv = el.querySelector('.attr-note')

  closeBtn.addEventListener('click', () => { el.style.display = 'none' })

  const esc = (v) => String(v ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

  const render = (results /*, coordinate, pixel */) => {
    if (!results?.length) {
      el.style.display = 'none'
      headDiv.textContent = ''
      tableEl.innerHTML = ''
      noteDiv.style.display = 'none'
      return
    }

    // show first result (extend to list/tabs later)
    const r = results[0]
    const layerTitle = r.layer?.get?.('title') || r.layer?.get?.('name') || 'Layer'

    // build rows
    const rowsHtml = Object.entries(r.props)
      .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
      .join('')

    headDiv.innerHTML = `<strong>${esc(layerTitle)}</strong>`
    tableEl.innerHTML = rowsHtml

    if (results.length > 1) {
      noteDiv.style.display = ''
      noteDiv.textContent = `${results.length - 1} more hit(s) under cursor`
    } else {
      noteDiv.style.display = 'none'
      noteDiv.textContent = ''
    }

    // show panel
    el.style.display = ''
  }

  return render
}

