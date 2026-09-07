'use client';

import { useRouter } from 'next/router';

import MapWindow from './MapWindow';

export default function HaggaBasinMap() {
  const router = useRouter();
  const mapName = router.query.map === 'DeepDesert' ? 'DeepDesert' : 'HaggaBasin';

  return (
    <MapWindow
      mapName={mapName}
      title={mapName === 'DeepDesert' ? 'DEEP DESERT' : 'HAGGA BASIN'}
      onMapChange={(map: string) =>
        void router.replace({ pathname: '/map', query: { map } }, undefined, { shallow: true })
      }
    />
  );
}
