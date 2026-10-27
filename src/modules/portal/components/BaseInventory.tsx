import { useEffect, useRef, useState } from 'react';
import { formatNumber } from '../utils/formatting';
import { record } from '../utils/inventory';
import { itemImage } from '../utils/item-image';
import ItemImage from './ItemImage';
import css from '../base-inventory.module.css';

type InventoryItem = { templateId?: string; name?: string; quantity?: number; image?: string };
type Container = {
  placeableId?: string;
  name?: string;
  typeName?: string;
  usedSlots?: number;
  maxSlots?: number;
  itemCount?: number;
  items?: InventoryItem[];
};
const CONTAINERS_PER_PAGE = 10;
const ITEMS_PER_PAGE = 12;
const fill = (used = 0, total = 0) => (total > 0 ? Math.max(0, Math.min(100, (used / total) * 100)) : 0);

/** A bounded storage workspace; each column scrolls independently of its controls. */
export default function BaseInventory({
  baseName,
  inventory,
  onClose,
}: {
  baseName: string;
  inventory: unknown;
  onClose: () => void;
}) {
  const root = record(inventory);
  const containers = Array.isArray(root.containers) ? (root.containers as Container[]) : [];
  // Index selection also handles containers whose provider omitted a placeable ID.
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [query, setQuery] = useState('');
  const [containerPage, setContainerPage] = useState(0);
  const [itemPage, setItemPage] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const selected = containers[selectedIndex] ?? containers[0];
  const normalizedQuery = query.trim().toLowerCase();
  const visibleItems = (selected?.items ?? []).filter((item) =>
    `${item.name ?? ''} ${item.templateId ?? ''}`.toLowerCase().includes(normalizedQuery),
  );
  const containerPageCount = Math.max(1, Math.ceil(containers.length / CONTAINERS_PER_PAGE));
  const currentContainerPage = Math.min(containerPage, containerPageCount - 1);
  const itemPageCount = Math.max(1, Math.ceil(visibleItems.length / ITEMS_PER_PAGE));
  const currentItemPage = Math.min(itemPage, itemPageCount - 1);
  const totalItems = containers.reduce((sum, container) => sum + Number(container.itemCount ?? 0), 0);
  const totalSlots = containers.reduce((sum, container) => sum + Number(container.maxSlots ?? 0), 0);
  const usedSlots = containers.reduce((sum, container) => sum + Number(container.usedSlots ?? 0), 0);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const elements = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href], [tabindex="0"]') ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      const first = elements[0],
        last = elements.at(-1);
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [onClose]);

  return (
    <div
      className={css.backdrop}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={css.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={`${baseName} storage`}
        tabIndex={-1}
      >
        <header className={css.header}>
          <div className={css.title}>
            <p className={css.eyebrow}>Base storage</p>
            <h2>{baseName}</h2>
            <div className={css.capacity}>
              <span className={css.meter} aria-hidden="true">
                <i style={{ width: `${fill(usedSlots, totalSlots)}%` }} />
              </span>
              <span>
                {formatNumber(usedSlots, 0)} / {formatNumber(totalSlots, 0)} slots used
              </span>
            </div>
          </div>
          <div className={css.summary}>
            <strong>{formatNumber(totalItems, 0)} items</strong>
            <span>{containers.length} storage containers</span>
          </div>
          <button type="button" className={css.close} aria-label="Close base storage" onClick={onClose}>
            ×
          </button>
        </header>
        {!containers.length ? (
          <div className={css.empty}>
            <h3>No containers yet</h3>
            <p>No storage containers were reported for this base.</p>
          </div>
        ) : (
          <div className={css.workspace}>
            <aside className={css.sidebar} aria-label="Base storage containers">
              <div className={css.sectionLabel}>
                <h3>Containers</h3>
                <span>{containers.length}</span>
              </div>
              <div className={css.containerList}>
                {containers
                  .slice(currentContainerPage * CONTAINERS_PER_PAGE, (currentContainerPage + 1) * CONTAINERS_PER_PAGE)
                  .map((container, offset) => {
                    const index = currentContainerPage * CONTAINERS_PER_PAGE + offset;
                    const active = container === selected;
                    return (
                      <button
                        type="button"
                        key={`${container.placeableId ?? 'container'}-${index}`}
                        aria-pressed={active}
                        onClick={() => {
                          setSelectedIndex(index);
                          setItemPage(0);
                        }}
                      >
                        <span className={css.containerIcon} aria-hidden="true">
                          ▱
                        </span>
                        <span className={css.containerInfo}>
                          <strong>{container.name || container.typeName || 'Unnamed container'}</strong>
                          <small>
                            {container.usedSlots ?? 0}/{container.maxSlots ?? '—'} slots ·{' '}
                            {formatNumber(container.itemCount ?? 0, 0)} items
                          </small>
                          <span className={css.meter} aria-hidden="true">
                            <i style={{ width: `${fill(container.usedSlots, container.maxSlots)}%` }} />
                          </span>
                        </span>
                      </button>
                    );
                  })}
              </div>
              <Pager
                page={currentContainerPage}
                pageCount={containerPageCount}
                onPageChange={setContainerPage}
                label="Containers"
              />
            </aside>
            <section className={css.content} aria-label="Container contents">
              <div className={css.toolbar}>
                <div>
                  <p className={css.eyebrow}>Selected container</p>
                  <h3>{selected?.name || selected?.typeName || 'Container'}</h3>
                  <p>{selected?.typeName || 'Storage container'}</p>
                </div>
                <label>
                  Search items
                  <input
                    value={query}
                    maxLength={128}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setItemPage(0);
                    }}
                    placeholder="Name or template"
                  />
                </label>
              </div>
              <div className={css.itemsScroll}>
                {visibleItems.length ? (
                  <ul className={css.items} aria-label="Container items">
                    {visibleItems
                      .slice(currentItemPage * ITEMS_PER_PAGE, (currentItemPage + 1) * ITEMS_PER_PAGE)
                      .map((item, index) => (
                        <li key={`${item.templateId ?? item.name}-${index}`}>
                          <span className={css.itemImage}>
                            <ItemImage src={itemImage(item)} />
                          </span>
                          <span className={css.itemInfo}>
                            <strong title={item.name}>{item.name ?? item.templateId ?? 'Unknown item'}</strong>
                            <small>{item.templateId ?? '—'}</small>
                          </span>
                          <b>×{formatNumber(item.quantity ?? 0, 0)}</b>
                        </li>
                      ))}
                  </ul>
                ) : (
                  <div className={css.empty} role="status">
                    <span className={css.emptyIcon} aria-hidden="true">
                      ▱
                    </span>
                    <h3>{normalizedQuery ? 'No matching items' : 'This container is empty'}</h3>
                    <p>
                      {normalizedQuery ? 'Try another name or template.' : 'No items were reported in this container.'}
                    </p>
                    {normalizedQuery && (
                      <button type="button" onClick={() => setQuery('')}>
                        Clear search
                      </button>
                    )}
                  </div>
                )}
              </div>
              <Pager page={currentItemPage} pageCount={itemPageCount} onPageChange={setItemPage} label="Items" />
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

function Pager({
  page,
  pageCount,
  onPageChange,
  label,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  label: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className={css.pager} aria-label={`${label} pagination`}>
      <button
        type="button"
        aria-label={`Previous ${label.toLowerCase()} page`}
        disabled={page === 0}
        onClick={() => onPageChange(page - 1)}
      >
        ←
      </button>
      <span>
        {label} page {page + 1} of {pageCount}
      </span>
      <button
        type="button"
        aria-label={`Next ${label.toLowerCase()} page`}
        disabled={page >= pageCount - 1}
        onClick={() => onPageChange(page + 1)}
      >
        →
      </button>
    </nav>
  );
}
