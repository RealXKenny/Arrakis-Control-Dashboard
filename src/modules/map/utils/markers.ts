export function markerKey(marker, index) {
  return String(`${marker?.type || 'marker'}-${marker?.id ?? marker?.base_id ?? index}-${index}`);
}
