import WMSLayerHandler from './WMSLayerHandler'
import WFSLayerHandler from './WFSLayerHandler'
import RESTLayerHandler from './RESTLayerHandler'

export const LAYER_TYPES = {
  wms: WMSLayerHandler,
  wfs: WFSLayerHandler,
  supabase_rest: RESTLayerHandler,
}

