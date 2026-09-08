import { useEffect, useState } from 'react';
import { COLORS } from '../config/colors';
import { formatNumber } from '../utils/formatting';
import { record } from '../utils/inventory';
import { itemImage } from '../utils/item-image';
import ItemImage from './ItemImage';

type InventoryItem = {
  templateId?: string;
  name?: string;
  quantity?: number;
  image?: string;
};

type Container = {
  placeableId?: string;
  name?: string;
  typeName?: string;
  group?: string;
  usedSlots?: number;
  maxSlots?: number;
  itemCount?: number;
  items?: InventoryItem[];
};

const ITEMS_PER_PAGE = 9;

function getContainers(inventory: unknown): Container[] {
  const root = record(inventory);
  const containers = root.containers;
  return Array.isArray(containers) ? (containers as Container[]) : [];
}

export default function BaseInventory({
  baseName,
  inventory,
  onClose,
}: {
  baseName: string;
  inventory: unknown;
  onClose: () => void;
}) {
  const containers = getContainers(inventory);
  const [selectedId, setSelectedId] = useState(containers[0]?.placeableId ?? '');
  const [query, setQuery] = useState('');
  const [containerPage, setContainerPage] = useState(0);
  const [itemPage, setItemPage] = useState(0);
  const [containersPerPage, setContainersPerPage] = useState(10);
  const selected = containers.find((container) => container.placeableId === selectedId) ?? containers[0];
  const normalizedQuery = query.trim().toLowerCase();

  const visibleItems = (selected?.items ?? []).filter((item) => {
    if (!normalizedQuery) return true;
    return `${item.name ?? ''} ${item.templateId ?? ''}`.toLowerCase().includes(normalizedQuery);
  });
  const containerPageCount = Math.max(1, Math.ceil(containers.length / containersPerPage));
  const visibleContainers = containers.slice(
    containerPage * containersPerPage,
    (containerPage + 1) * containersPerPage,
  );
  const itemPageCount = Math.max(1, Math.ceil(visibleItems.length / ITEMS_PER_PAGE));
  const pagedItems = visibleItems.slice(itemPage * ITEMS_PER_PAGE, (itemPage + 1) * ITEMS_PER_PAGE);

  const totalItems = containers.reduce((sum, container) => sum + Number(container.itemCount ?? 0), 0);
  const totalSlots = containers.reduce((sum, container) => sum + Number(container.maxSlots ?? 0), 0);
  const usedSlots = containers.reduce((sum, container) => sum + Number(container.usedSlots ?? 0), 0);
  const fillPercent = totalSlots > 0 ? Math.min(100, (usedSlots / totalSlots) * 100) : 0;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    setItemPage(0);
  }, [selectedId, query]);

  useEffect(() => {
    const updatePageSize = () => {
      setContainersPerPage(Math.max(6, Math.floor((window.innerHeight - 205) / 58)));
    };
    updatePageSize();
    window.addEventListener('resize', updatePageSize);
    return () => window.removeEventListener('resize', updatePageSize);
  }, []);

  return (
    <div
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(5px)',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`${baseName} storage`}
        style={{
          width: 'min(1200px, calc(100vw - 32px))',
          height: 'min(900px, calc(100vh - 32px))',
          boxSizing: 'border-box',
          overflow: 'hidden',
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
          padding: 22,
          background: 'linear-gradient(145deg, rgba(37, 24, 13, 0.98), rgba(12, 8, 5, 0.98))',
          border: `1px solid ${COLORS.border}`,
          borderRadius: 14,
          boxShadow: '0 24px 80px rgba(0,0,0,0.65)',
          borderTop: `2px solid ${COLORS.gold}`,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 18,
            paddingBottom: 14,
            borderBottom: `1px solid ${COLORS.borderLight}`,
          }}
        >
          <div>
            <p
              style={{
                margin: '0 0 4px',
                color: COLORS.goldLight,
                fontSize: '0.65rem',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              Base storage
            </p>
            <h3 style={{ margin: 0, color: COLORS.text, fontSize: '1.25rem', letterSpacing: '-0.02em' }}>{baseName}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <div style={{ width: 120, height: 5, overflow: 'hidden', borderRadius: 99, background: '#090604' }}>
                <div
                  style={{
                    width: `${fillPercent}%`,
                    height: '100%',
                    borderRadius: 99,
                    background: `linear-gradient(90deg, ${COLORS.gold}, #f0c66b)`,
                  }}
                />
              </div>
              <span style={{ color: COLORS.dim, fontSize: '0.62rem' }}>
                {usedSlots}/{totalSlots || '—'} slots used
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ textAlign: 'right', color: COLORS.dim, fontSize: '0.72rem' }}>
              <strong style={{ display: 'block', color: COLORS.goldLight, fontSize: '0.8rem' }}>
                {formatNumber(totalItems, 0)} items
              </strong>
              <span>{containers.length} storage containers</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close base storage"
              style={{
                border: `1px solid ${COLORS.border}`,
                borderRadius: 6,
                padding: '5px 9px',
                cursor: 'pointer',
                color: COLORS.textSoft,
                background: '#ffffff08',
                fontSize: '0.9rem',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {!containers.length ? (
          <p style={{ margin: 0, color: COLORS.dim, fontSize: '0.8rem' }}>
            No storage containers were reported for this base.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(240px, 0.82fr) minmax(0, 2fr)',
              gap: 18,
              minHeight: 0,
            }}
          >
            <div
              style={{ display: 'grid', minHeight: 0, gridTemplateRows: 'minmax(0, 1fr) auto', gap: 7 }}
              role="list"
              aria-label="Base storage containers"
            >
              <div
                style={{
                  display: 'grid',
                  gap: 7,
                  minHeight: 0,
                  alignContent: 'start',
                }}
              >
                {visibleContainers.map((container) => {
                  const active = container.placeableId === (selected?.placeableId ?? '');
                  const containerLabel = container.name || container.typeName || 'Unnamed container';
                  return (
                    <button
                      key={container.placeableId ?? container.name}
                      type="button"
                      onClick={() => setSelectedId(container.placeableId ?? '')}
                      aria-pressed={active}
                      style={{
                        appearance: 'none',
                        textAlign: 'left',
                        cursor: 'pointer',
                        padding: '11px 13px',
                        borderRadius: 8,
                        border: `1px solid ${active ? 'rgba(210,168,90,0.35)' : COLORS.borderLight}`,
                        background: active ? 'rgba(210,168,90,0.1)' : '#ffffff03',
                        color: active ? COLORS.text : COLORS.textSoft,
                        minHeight: 54,
                      }}
                    >
                      <strong
                        style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: active ? COLORS.goldLight : COLORS.textSoft,
                          fontSize: '0.74rem',
                          marginBottom: 5,
                        }}
                        title={containerLabel}
                      >
                        {containerLabel}
                      </strong>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ flex: 1, color: COLORS.dim, fontSize: '0.62rem' }}>
                          {container.usedSlots ?? 0}/{container.maxSlots ?? '—'} slots ·{' '}
                          {formatNumber(container.itemCount ?? 0, 0)} items
                        </span>
                        <span
                          style={{ width: 40, height: 3, overflow: 'hidden', borderRadius: 99, background: '#090604' }}
                        >
                          <span
                            style={{
                              display: 'block',
                              width: `${container.maxSlots ? Math.min(100, ((container.usedSlots ?? 0) / container.maxSlots) * 100) : 0}%`,
                              height: '100%',
                              background: active ? COLORS.gold : '#80613d',
                            }}
                          />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <Pager
                page={containerPage}
                pageCount={containerPageCount}
                onPageChange={setContainerPage}
                label="Containers"
              />
            </div>

            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  marginBottom: 10,
                  padding: '10px 12px',
                  background: 'rgba(255,255,255,0.025)',
                  border: `1px solid ${COLORS.borderLight}`,
                  borderRadius: 9,
                }}
              >
                <div>
                  <h4 style={{ margin: 0, color: COLORS.text, fontSize: '0.95rem' }}>
                    {selected?.name ?? 'Container'}
                  </h4>
                  <span style={{ color: COLORS.dim, fontSize: '0.65rem' }}>
                    {selected?.typeName ?? 'Storage container'}
                  </span>
                </div>
                <label style={{ color: COLORS.dim, fontSize: '0.65rem' }}>
                  Search items
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Name or template"
                    style={{
                      display: 'block',
                      width: 190,
                      marginTop: 4,
                      padding: '7px 9px',
                      color: COLORS.text,
                      background: '#090604',
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 6,
                      outline: 'none',
                    }}
                  />
                </label>
              </div>
              <ul
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                  gap: 8,
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                }}
              >
                {pagedItems.map((item, index) => (
                  <li
                    key={`${item.templateId ?? item.name}-${index}`}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '56px minmax(0, 1fr) auto',
                      gap: 9,
                      alignItems: 'center',
                      minHeight: 72,
                      padding: '8px 10px',
                      overflow: 'hidden',
                      background: '#ffffff04',
                      border: `1px solid ${COLORS.borderLight}`,
                      boxShadow: '0 5px 14px rgba(0,0,0,0.14)',
                      borderRadius: 7,
                    }}
                  >
                    <ItemImage src={itemImage(item)} />
                    <span style={{ minWidth: 0 }}>
                      <strong
                        style={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: COLORS.textSoft,
                          fontSize: '0.72rem',
                        }}
                        title={item.name}
                      >
                        {item.name ?? item.templateId ?? 'Unknown item'}
                      </strong>
                      <small style={{ color: COLORS.dim, fontSize: '0.58rem' }}>{item.templateId ?? '—'}</small>
                    </span>
                    <b style={{ color: COLORS.goldLight, fontSize: '0.72rem' }}>
                      ×{formatNumber(item.quantity ?? 0, 0)}
                    </b>
                  </li>
                ))}
              </ul>
              <Pager page={itemPage} pageCount={itemPageCount} onPageChange={setItemPage} label="Items" />
              {!visibleItems.length && (
                <p style={{ color: COLORS.dim, fontSize: '0.75rem' }}>No items match this search.</p>
              )}
            </div>
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
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10 }}>
      <button type="button" disabled={page === 0} onClick={() => onPageChange(page - 1)} style={pagerButtonStyle}>
        ←
      </button>
      <span style={{ color: COLORS.dim, fontSize: '0.62rem' }}>
        {label} page {page + 1} of {pageCount}
      </span>
      <button
        type="button"
        disabled={page === pageCount - 1}
        onClick={() => onPageChange(page + 1)}
        style={pagerButtonStyle}
      >
        →
      </button>
    </div>
  );
}

const pagerButtonStyle = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  padding: '4px 9px',
  cursor: 'pointer',
  color: COLORS.textSoft,
  background: '#ffffff08',
  fontSize: '0.75rem',
};
