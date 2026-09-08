import { useState } from 'react';
import { inventoryItems } from '../utils/inventory';
import type { buildCharacter } from '../utils/character';
import { formatNumber } from '../utils/formatting';
import css from '../dossier.module.css';
import ItemImage from './ItemImage';
import { itemImage } from '../utils/item-image';

export default function StorageWorkspace({
  inventory,
  character,
}: {
  inventory: unknown;
  character: ReturnType<typeof buildCharacter>;
}) {
  const [selected, setSelected] = useState('All containers');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const items = inventoryItems(inventory);
  const groups = ['All containers', ...new Set(items?.map((item) => item.group) ?? [])];
  const active = groups.includes(selected) ? selected : 'All containers';
  const visible =
    items?.filter(
      (item) =>
        (active === 'All containers' || item.group === active) && item.name.toLowerCase().includes(query.toLowerCase()),
    ) ?? [];
  return (
    <div className={css.storage}>
      <aside className={css.panel}>
        <h2>Personal assets</h2>
        <p className={css.balance}>{formatNumber(character.solarisCredit, 0)}</p>
        <p>Solari credit</p>
        <dl className={css.facts}>
          <div>
            <dt>Solari coin</dt>
            <dd>{formatNumber(character.solaris, 0)}</dd>
          </div>
          <div>
            <dt>Scrip</dt>
            <dd>{formatNumber(character.scrip, 0)}</dd>
          </div>
        </dl>
        <div className={css.readonly}>Inventory readings are read-only. Manage items and currency in game.</div>
      </aside>
      <aside className={css.panel}>
        <h2>Containers</h2>
        <div className={css.containerArt} aria-hidden="true">
          ▱
        </div>
        <div className={css.containers} role="group" aria-label="Inventory containers">
          {groups.map((group) => (
            <button key={group} aria-pressed={active === group} onClick={() => setSelected(group)}>
              <span>{group}</span>
              <b>{items ? items.filter((item) => group === 'All containers' || item.group === group).length : '—'}</b>
            </button>
          ))}
        </div>
      </aside>
      <section className={css.panel}>
        <div className={css.toolbar}>
          <h2>{active}</h2>
          <div role="group" aria-label="Storage view">
            <button aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
              Grid
            </button>
            <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
              List
            </button>
          </div>
        </div>
        <label className={css.search}>
          Search inventory
          <input
            value={query}
            maxLength={128}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find an item in your containers"
          />
        </label>
        <p className={css.caption} aria-live="polite">
          {items ? `${visible.length} item stacks` : 'Inventory unavailable — refresh telemetry to try again.'}
        </p>
        <ul className={view === 'grid' ? css.items : css.itemList} aria-label="Inventory items">
          {visible.map((item, index) => (
            <li key={`${item.group}-${item.id}-${index}`}>
              <span className={css.itemSymbol} aria-hidden="true">
                <ItemImage src={itemImage(item.source)} />
              </span>
              <strong>{item.name}</strong>
              <span>{item.group}</span>
              <b>× {item.quantity}</b>
              <small>Grade {item.grade}</small>
            </li>
          ))}
        </ul>
        {items && !visible.length && (
          <p className={css.empty}>{query ? 'No items match this search.' : 'No items reported in this container.'}</p>
        )}
      </section>
    </div>
  );
}
