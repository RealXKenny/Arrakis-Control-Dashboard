import type { Metadata } from 'next';
import { ItemFinder } from '../../player/components/item-finder';
import Image from 'next/image';
import Link from 'next/link';
import { formatNumber } from '../../../lib/format';
import { inventoryItems, type InventoryItem } from '../../player/inventory';
import { itemImage } from '../../player/item-image';
import { ALL_CONTAINERS, parseStorageQuery, storageHref, viewStorage } from '../../player/storage';
import { loadPortalProfile } from '../server/load';
import { requireSession } from '../../auth/server/session';
import { ProfileFailure } from './profile-failure';
import { PageHeader } from '../../../components/ui/page-header';

export const metadata: Metadata = { title: 'Storage' };

function ItemPicture({ item }: { item: InventoryItem }) {
  const image = itemImage(item.source);
  return (
    <span className="flex size-12 shrink-0 items-center justify-center bg-obsidian-950">
      {image ? (
        <Image src={image} alt="" width={40} height={40} unoptimized className="size-10 object-contain" />
      ) : (
        <span aria-hidden="true" className="text-sand-700">
          ◇
        </span>
      )}
    </span>
  );
}

export default async function StoragePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const query = parseStorageQuery(await searchParams);
  const result = await loadPortalProfile(session);
  if (result.status !== 'ok') {
    return (
      <>
        <PageHeader eyebrow="Personal inventory" title="Storage" />
        <ItemFinder />
        <ProfileFailure result={result} />
      </>
    );
  }

  const { character, details } = result.profile;
  const items = inventoryItems(details.inventory);
  const view = items ? viewStorage(items, query) : null;

  return (
    <>
      <PageHeader eyebrow="Personal inventory" title="Storage" />
      <ItemFinder />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <aside className="grid min-w-0 grid-cols-1 content-start gap-6 lg:col-span-4">
          <section className="panel p-6" aria-labelledby="assets">
            <h2 id="assets" className="text-base">
              Personal assets
            </h2>
            <p className="mt-5 text-3xl font-extrabold text-sand-50">{formatNumber(character.solarisCredit, 0)}</p>
            <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">Solari credit</p>
            <dl className="mt-5 grid gap-px bg-sand-200/10">
              <div className="flex items-baseline justify-between bg-obsidian-900 px-4 py-3">
                <dt className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">Solari coin</dt>
                <dd className="font-mono text-sm text-spice-400">{formatNumber(character.pocketSolari, 0)}</dd>
              </div>
              <div className="flex items-baseline justify-between bg-obsidian-900 px-4 py-3">
                <dt className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">Scrip</dt>
                <dd className="font-mono text-sm text-spice-400">{formatNumber(character.scrip, 0)}</dd>
              </div>
            </dl>
            <p className="mt-5 text-xs text-sand-500">
              Inventory readings are read-only. Manage items and currency in game.
            </p>
          </section>

          {view && (
            <nav className="panel p-6" aria-label="Inventory containers">
              <h2 className="text-base">Containers</h2>
              <ul className="mt-5 grid gap-px bg-sand-200/10">
                {view.containers.map((container) => (
                  <li key={container.name}>
                    <Link
                      href={storageHref(query, { container: container.name })}
                      replace
                      aria-current={view.active === container.name ? 'page' : undefined}
                      className={`flex items-center justify-between px-4 py-3 text-xs font-bold uppercase tracking-[0.15em] ${
                        view.active === container.name
                          ? 'bg-spice-500 text-obsidian-950'
                          : 'bg-obsidian-900 text-sand-200 hover:text-spice-300'
                      }`}
                    >
                      <span>{container.name}</span>
                      <b className="font-mono">{container.count}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </aside>

        <section className="panel min-w-0 p-6 lg:col-span-8" aria-labelledby="items-heading">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 id="items-heading" className="text-base">
              {view?.active ?? 'Inventory'}
            </h2>
            {view && (
              <div role="group" aria-label="Storage layout" className="grid grid-cols-2 border border-sand-200/20">
                {(['grid', 'list'] as const).map((layout) => (
                  <Link
                    key={layout}
                    href={storageHref(query, { layout })}
                    replace
                    aria-current={query.layout === layout ? 'page' : undefined}
                    className={`flex min-h-9 items-center px-4 text-[0.6875rem] font-bold uppercase tracking-[0.2em] ${
                      query.layout === layout ? 'bg-spice-500 text-obsidian-950' : 'text-sand-300 hover:text-spice-300'
                    }`}
                  >
                    {layout}
                  </Link>
                ))}
              </div>
            )}
          </div>

          {!view ? (
            <p className="mt-6 text-sm text-sand-500">Inventory unavailable. Reload to try again.</p>
          ) : (
            <>
              {/* Plain GET form: search lives in the URL, so no client JavaScript is needed. */}
              <form action="/storage" method="get" className="mt-6 flex gap-3">
                {view.active !== ALL_CONTAINERS && <input type="hidden" name="container" value={view.active} />}
                {query.layout !== 'grid' && <input type="hidden" name="layout" value={query.layout} />}
                <input
                  type="search"
                  name="q"
                  defaultValue={query.q}
                  maxLength={128}
                  aria-label="Search inventory"
                  placeholder="Find an item in your containers"
                  className="h-11 min-w-0 flex-1 border border-sand-200/20 bg-obsidian-900 px-3 text-sm text-sand-50 placeholder:text-sand-600"
                />
                <button type="submit" className="btn btn-primary">
                  Search
                </button>
              </form>
              <p className="mt-4 font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500" aria-live="polite">
                {view.items.length} item stacks
              </p>

              {view.items.length === 0 ? (
                <p className="mt-6 text-sm text-sand-500">
                  {query.q ? 'No items match this search.' : 'No items reported in this container.'}
                </p>
              ) : query.layout === 'grid' ? (
                <ul aria-label="Inventory items" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {view.items.map((item, index) => (
                    <li
                      key={`${item.group}-${item.id}-${index}`}
                      className="flex flex-col gap-2 border border-sand-200/10 bg-obsidian-900 p-3"
                    >
                      <ItemPicture item={item} />
                      <strong className="line-clamp-2 text-xs uppercase leading-snug tracking-wide text-sand-100">
                        {item.name}
                      </strong>
                      <span className="mt-auto flex justify-between font-mono text-[0.6875rem] text-sand-400">
                        <b className="text-spice-400">× {item.quantity}</b>
                        <small>G{item.grade}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul aria-label="Inventory items" className="mt-4 grid grid-cols-1 gap-px bg-sand-200/10">
                  {view.items.map((item, index) => (
                    <li
                      key={`${item.group}-${item.id}-${index}`}
                      className="flex items-center gap-4 bg-obsidian-900 px-4 py-3"
                    >
                      <ItemPicture item={item} />
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-xs uppercase tracking-wide text-sand-100">
                          {item.name}
                        </strong>
                        <small className="font-mono text-[0.625rem] uppercase tracking-widest text-sand-500">
                          {item.group}
                        </small>
                      </span>
                      <b className="font-mono text-xs text-spice-400">× {item.quantity}</b>
                      <small className="w-10 text-right font-mono text-xs text-sand-400">G{item.grade}</small>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>
    </>
  );
}
