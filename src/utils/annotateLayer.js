// src/utils/annotateLayer.js
export function annotateLayer(olLayer, row) {
  olLayer.set('title', row.title || row.name || row.layer_name || 'Layer')

  const ident = row.layer_params?.identify
  if (row.type === 'wms') {
    olLayer.set('identify', ident ?? {
      infoFormat: 'application/json',
      queryLayers: row.layer_name,
    })
  } else if (['wfs','vector','rest','ogc_features','supabase_rest'].includes(row.type)) {
    olLayer.set('identify', ident ?? { enabled: true })
  } else {
    olLayer.set('identify', ident ?? { enabled: false })
  }
}

