import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { findOperation } from '../client';
import { Facts, QueryState, ReadPanel, Table } from '../components/DataPanel';
import useAdminQuery from '../hooks/useAdminQuery';
import useAdminUrl from '../hooks/useAdminUrl';
import { useConfirmedAction } from '../hooks/useConfirmedAction';
import { adminHref } from '../navigation';
import { idFrom, resultRows, text, type Row } from '../records';
import type { AdminOperation } from '../types';
import css from '../styles/admin.module.css';

const LAYERS = [
  ['players', 'Players', 'get-map-players'],
  ['bases', 'Bases', 'get-map-bases'],
  ['storage', 'Storage', 'get-map-storage'],
  ['services', 'Services', 'get-map-services'],
  ['markers', 'Markers', 'get-map-markers'],
  ['spice', 'Spice', 'get-map-spice'],
  ['poi', 'Points of interest', 'get-map-poi'],
] as const;
const MAP_KEYS = ['map', 'map_name', 'mapName', 'name'];
const PARTITION_KEYS = ['partitionId', 'partition_id', 'partition', 'id'];

function Teleport({ operations, map, partition }: { operations: AdminOperation[]; map: string; partition: string }) {
  const [notice, setNotice] = useState('');
  const [fields, setFields] = useState({ playerId: '', x: '', y: '', z: '', yaw: '' });
  const [online, setOnline] = useState(false);
  const { act, dialog } = useConfirmedAction(operations, setNotice);
  const set = (key: keyof typeof fields) => (event: { target: { value: string } }) =>
    setFields({ ...fields, [key]: event.target.value });
  function submit(event: FormEvent) {
    event.preventDefault();
    const [x, y, z] = [fields.x, fields.y, fields.z].map(Number);
    const yaw = fields.yaw.trim() ? Number(fields.yaw) : undefined;
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(fields.playerId.trim())) return setNotice('Enter a valid player ID.');
    if (![x, y, z].every(Number.isFinite) || (yaw !== undefined && !Number.isFinite(yaw)))
      return setNotice('Coordinates must be numbers.');
    if (!map || !partition) return setNotice('Choose a map and a partition first. A teleport never picks one for you.');
    act(
      'post-map-teleport-player',
      {
        body: {
          playerId: fields.playerId.trim(),
          x,
          y,
          z,
          ...(yaw !== undefined ? { yaw } : {}),
          partitionId: partition,
          online,
        },
      },
      {
        title: 'Teleport a player',
        confirmLabel: 'Teleport player',
        danger: false,
        target: `Player ${fields.playerId.trim()} → ${map}, partition ${partition} at (${x}, ${y}, ${z})`,
        consequences: [
          online ? 'Moves the player now if they are online.' : 'Sets the position for the player’s next login.',
          'Only the selected partition is used; the dashboard never starts a map or crosses partitions.',
          'The Console refuses unsafe destinations.',
        ],
        done: online ? 'Teleport requested.' : 'Offline teleport saved.',
      },
    );
  }
  return (
    <section className={css.panel} aria-label="Teleport">
      <h3>Teleport a player</h3>
      {notice && (
        <p role="status" className={css.status}>
          {notice}
        </p>
      )}
      <p className={css.stateLine}>
        Destination map: <strong>{map || 'not chosen'}</strong> · partition:{' '}
        <strong>{partition || 'not chosen'}</strong>
      </p>
      <form onSubmit={submit}>
        <label className={css.field}>
          Player ID
          <input value={fields.playerId} onChange={set('playerId')} />
        </label>
        <div className={css.facts}>
          {(['x', 'y', 'z', 'yaw'] as const).map((key) => (
            <label className={css.field} key={key}>
              {key.toUpperCase()}
              {key === 'yaw' ? ' (optional)' : ''}
              <input inputMode="decimal" value={fields[key]} onChange={set(key)} />
            </label>
          ))}
        </div>
        <label className={css.field}>
          <span>
            <input type="checkbox" checked={online} onChange={(event) => setOnline(event.target.checked)} /> The player
            is online now
          </span>
        </label>
        <button type="submit">Review…</button>
      </form>
      {dialog}
    </section>
  );
}

export default function LiveMapScreen({ operations }: { operations: AdminOperation[] }) {
  const url = useAdminUrl();
  const partitions = useAdminQuery(findOperation(operations, 'get-map-partitions'));
  const rows = resultRows(partitions.data) ?? [];
  const maps = [...new Set(rows.map((row) => text(row, MAP_KEYS)).filter(Boolean))];
  const map = maps.includes(url.read('map')) ? url.read('map') : '';
  const options = rows.filter((row) => text(row, MAP_KEYS) === map);
  const partition = options.some((row) => text(row, PARTITION_KEYS) === url.read('partition'))
    ? url.read('partition')
    : '';
  const layer = LAYERS.find(([id]) => id === url.read('layer')) ?? LAYERS[0];
  const query: Record<string, string | number | boolean> = {
    ...(map ? { map } : {}),
    ...(partition ? { partitionId: partition } : {}),
  };
  const supportsPartition = ['markers', 'spice'].includes(layer[0]);
  const data = useAdminQuery(
    findOperation(operations, layer[2]),
    { query: supportsPartition ? query : map ? { map } : {} },
    Boolean(map),
  );
  const action = (row: Row) => {
    if (layer[0] === 'players') {
      const id = idFrom(row, 'player');
      return id ? (
        <Link href={`${adminHref('players')}&player=${encodeURIComponent(id)}`} shallow>
          Open player
        </Link>
      ) : null;
    }
    if (layer[0] === 'bases') {
      const id = idFrom(row, 'base');
      return id ? (
        <Link href={`${adminHref('bases')}&base=${encodeURIComponent(id)}`} shallow>
          Open base
        </Link>
      ) : null;
    }
    if (layer[0] === 'storage') {
      const id = text(row, ['storage_id', 'storageId', 'id']);
      return id ? (
        <Link href={`${adminHref('bases')}&view=storage&storage=${encodeURIComponent(id)}`} shallow>
          Open container
        </Link>
      ) : null;
    }
    return null;
  };
  return (
    <div className={css.screen}>
      <ReadPanel operations={operations} id="get-map-capabilities" title="What the live map supports" />
      <section className={css.panel} aria-label="Map selection">
        <h3>Choose a map and partition</h3>
        <QueryState loading={partitions.loading} error={partitions.error} onRetry={partitions.refresh}>
          {maps.length === 0 ? (
            <p className={css.stateLine}>The Console reported no maps. Nothing is started for you.</p>
          ) : (
            <div className={css.toolbar}>
              <label className={css.field}>
                Map
                <select
                  value={map}
                  onChange={(event) => url.update({ map: event.target.value || null, partition: null })}
                >
                  <option value="">Choose a map…</option>
                  {maps.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={css.field}>
                Partition
                <select
                  value={partition}
                  disabled={!map}
                  onChange={(event) => url.update({ partition: event.target.value || null })}
                >
                  <option value="">All / not chosen</option>
                  {options.map((row) => {
                    const id = text(row, PARTITION_KEYS);
                    return id ? (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ) : null;
                  })}
                </select>
              </label>
              <Link href="/map">Open the interactive map ↗</Link>
            </div>
          )}
        </QueryState>
      </section>
      {map && (
        <section className={css.panel} aria-label="Map layers">
          <h3>
            {layer[1]} on {map}
            {partition && supportsPartition ? `, partition ${partition}` : ''}
          </h3>
          <div className={css.subTabs} role="group" aria-label="Map layers">
            {LAYERS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={id === layer[0]}
                onClick={() => url.update({ layer: id === 'players' ? null : id }, 'replace')}
              >
                {label}
              </button>
            ))}
          </div>
          {!supportsPartition && partition && (
            <p className={css.stateLine}>
              This layer is read per map, not per partition, so the partition choice does not narrow it.
            </p>
          )}
          <QueryState loading={data.loading} error={data.error} onRetry={data.refresh}>
            {resultRows(data.data) ? (
              <Table
                value={data.data}
                caption={layer[1]}
                empty={`No ${layer[1].toLowerCase()} were reported.`}
                action={action}
              />
            ) : (
              <Facts value={data.data} />
            )}
          </QueryState>
          <div className={css.actions}>
            <button type="button" onClick={data.refresh} disabled={data.loading}>
              Refresh
            </button>
          </div>
        </section>
      )}
      <Teleport operations={operations} map={map} partition={partition} />
    </div>
  );
}
