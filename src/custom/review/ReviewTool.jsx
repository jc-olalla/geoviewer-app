// custom/review/ReviewTool.jsx
import { useContext } from 'react'
import { MapContext } from '../../context/MapContext'
import ReviewPanel from './ReviewPanel'
import useReview from './useReview'
import { TARGET_LAYER_TITLE } from './config'
import { saveBatchRPC } from './reviewApi'

// Helper: find a layer by its title/name (handles groups)
function findLayerByTitle(map, title) {
  if (!map) return null
  const flatten = (groupOrLayer, out = []) => {
    if (!groupOrLayer) return out
    if (typeof groupOrLayer.getLayers === 'function') {
      groupOrLayer.getLayers().forEach(l => flatten(l, out))
    } else {
      out.push(groupOrLayer)
    }
    return out
  }
  const all = flatten(map)
  return all.find(l => (l.get && (l.get('title') || l.get('name'))) === title) || null
}

export default function ReviewTool() {
  const map = useContext(MapContext)
  const {
    selectedCount, pendingCount,
    start, exit, applyDecision, getBatch,
  } = useReview(map, { targetLayerTitle: TARGET_LAYER_TITLE })

  return (
    <ReviewPanel
      selectedCount={selectedCount}
      pendingCount={pendingCount}
      onStart={() => start()}
      onExit={() => exit()}
      onApply={({ payload }) => applyDecision({ payload })}
      onSave={async ({ reviewer }) => {
        const batch = getBatch()
        if (!batch.length) return

        const res = await saveBatchRPC(batch, { reviewer })

        if (res.ok) {
          // Update in-memory features so map reflects committed data
          const layer = findLayerByTitle(map, TARGET_LAYER_TITLE)
          const source = layer?.getSource?.()
          if (source && Array.isArray(res.rows)) {
            for (const r of res.rows) {
              const fid = String(r.out_fid)
              const f = source.getFeatureById(fid)
              if (!f) continue
              f.set('is_portiek', r.out_is_portiek)
              f.set('review_status', r.out_review_status)
              f.set('reviewer', r.out_reviewer)
              f.set('reviewed_at', r.out_reviewed_at)
              f.set('version', r.out_version)
            }
            layer?.changed?.()
          }

          alert(`Saved review. Please, refresh.`)
          // Clear review state/overlays
          exit()
        } else {
          console.error(res.errors)
          alert(`Some saves failed. Updated: ${res.updated}. See console for details.`)
        }
      }}
    />
  )
}

