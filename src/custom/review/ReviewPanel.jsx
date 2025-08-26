// custom/review/ReviewPanel.jsx
import { useMemo, useState } from 'react'

export default function ReviewPanel({
  selectedCount = 0,
  pendingCount = 0,
  onStart,
  onExit,
  onApply,
  onSave,
}) {
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewer, setReviewer] = useState(() => localStorage.getItem('reviewer_name') || '')
  const [editingName, setEditingName] = useState(!reviewer)
  const [decision, setDecision] = useState('Ja')

  const decisionPayload = useMemo(() => ({
    Ja:        { is_portiek: 'Ja',        review_status: 'gedaan' },
    Nee:       { is_portiek: 'Nee',       review_status: 'gedaan' },
    Misschien: { is_portiek: 'Misschien', review_status: 'gedaan' },
  }), [])

  const canApply = reviewMode && selectedCount > 0 && !!reviewer
  const canSave  = reviewMode && pendingCount > 0 && !!reviewer

  function handleStart() {
    if (!reviewer) { setEditingName(true); return }
    setReviewMode(true); onStart?.(reviewer)
  }
  function handleSaveName() {
    const name = reviewer.trim(); if (!name) return
    localStorage.setItem('reviewer_name', name)
    setEditingName(false)
    if (!reviewMode) { setReviewMode(true); onStart?.(name) }
  }
  function handleApply() {
    const payload = decisionPayload[decision]
    onApply?.({ decision, payload, reviewer })
  }
  function handleSave() { onSave?.({ reviewer }) }
  function handleExit() { setReviewMode(false); onExit?.() }

  return (
    <div style={panelStyle}>
      <div style={rowStyle}>
        <strong>Review</strong>
        {!reviewMode ? (
          <button onClick={handleStart} style={btnStyle}>Start</button>
        ) : (
          <button onClick={handleExit} style={btnGhostStyle}>Exit</button>
        )}
      </div>

      <div style={{ marginTop: 6 }}>
        <label style={labelStyle}>Reviewer</label>
        {!editingName ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ fontSize: 13 }}>{reviewer || <span style={{ color:'#888' }}>—</span>}</div>
            <button onClick={() => setEditingName(true)} style={tinyLinkBtn} title="Change name">change</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 6 }}>
            <input placeholder="Your name" value={reviewer} onChange={(e) => setReviewer(e.target.value)} style={inputStyle}/>
            <button onClick={handleSaveName} style={btnStyle}>Save</button>
          </div>
        )}
      </div>

      {reviewMode && (
        <>
          <div style={{ marginTop: 10 }}>
            <label style={labelStyle}>Decision</label>
            <select value={decision} onChange={(e) => setDecision(e.target.value)} style={selectStyle}>
              <option>Ja</option><option>Nee</option><option>Misschien</option>
            </select>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, color: '#444' }}>
            Selected: <strong>{selectedCount}</strong>
            {pendingCount > 0 && <span style={{ marginLeft: 8 }}>Pending: <strong>{pendingCount}</strong></span>}
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
            <button onClick={handleApply} disabled={!canApply} style={btnStyle}>Apply to Selected</button>
            <button onClick={handleSave} disabled={!canSave} style={btnPrimaryStyle}>
              Save Review{pendingCount > 0 ? ` (${pendingCount})` : ''}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const panelStyle = { position:'absolute', top:'1rem', right:'1rem', zIndex:1000, background:'#fff', border:'1px solid #e5e7eb', borderRadius:8, padding:12, width:260, boxShadow:'0 4px 16px rgba(0,0,0,.08)', font:'13px/1.3 system-ui, sans-serif' }
const rowStyle = { display:'flex', justifyContent:'space-between', alignItems:'center' }
const labelStyle = { display:'block', marginBottom:4, color:'#555', fontSize:12 }
const inputStyle = { flex:1, font:'13px system-ui, sans-serif', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:6, outline:'none' }
const selectStyle = { width:'100%', font:'13px system-ui, sans-serif', padding:'6px 8px', border:'1px solid #d1d5db', borderRadius:6, outline:'none', background:'#fff' }
const btnBase = { font:'13px system-ui, sans-serif', padding:'6px 10px', borderRadius:6, cursor:'pointer', border:'1px solid #d1d5db', background:'#fff' }
const btnStyle = { ...btnBase }
const btnGhostStyle = { ...btnBase, color:'#374151', background:'#f9fafb' }
const tinyLinkBtn = { ...btnBase, padding:'2px 6px', fontSize:12 }
const btnPrimaryStyle = { ...btnBase, background:'#2563eb', borderColor:'#2563eb', color:'#fff' }

