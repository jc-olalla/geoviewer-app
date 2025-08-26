// custom/review/ReviewTool.jsx
import { useContext } from 'react'
import { MapContext } from '../../context/MapContext'
import ReviewPanel from './ReviewPanel'
import useReview from './useReview'
import { TARGET_LAYER_TITLE } from './config'
import { saveBatchPATCH } from './reviewApi'

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
        const res = await saveBatchPATCH(batch, { reviewer })
        if (res.ok) {
          alert(`Saved ${res.updated} building(s).`)
          // Simple reset: exit + re-enter to clear overlays; or call exit() directly.
          exit()
        } else {
          console.error(res.errors)
          alert(`Some saves failed. Updated: ${res.updated}. See console for details.`)
        }
      }}
    />
  )
}

