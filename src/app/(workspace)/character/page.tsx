import type { Metadata } from 'next';
import Image from 'next/image';
import type { ReactNode } from 'react';
import { formatNumber } from '../../../features/portal/formatting';
import { inventoryItems, journeySummary, label, rows } from '../../../features/portal/inventory';
import { itemImage } from '../../../features/portal/item-image';
import { loadPortalProfile } from '../../../server/portal';
import { requireSession } from '../../../server/session';
import { ProfileFailure } from '../_components/gauge-notice';
import { PageHeader } from '../_components/page-header';

export const metadata: Metadata = { title: 'Character' };

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel p-6">
      <h2 className="text-base">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Facts({ data, nameKeys, valueKeys }: { data: unknown; nameKeys: string[]; valueKeys: string[] }) {
  const entries = rows(data);
  if (!entries?.length) {
    return <p className="text-sm text-sand-500">{entries ? 'No records reported.' : 'Readings unavailable.'}</p>;
  }
  return (
    <dl className="grid gap-px bg-sand-200/10">
      {entries.map((entry, index) => (
        <div key={index} className="flex items-baseline justify-between gap-4 bg-obsidian-900 px-4 py-3">
          <dt className="truncate text-xs font-bold uppercase tracking-wide text-sand-200">
            {label(
              nameKeys.map((key) => entry[key]).find((value) => value != null),
              'Unnamed record',
            )}
          </dt>
          <dd className="shrink-0 font-mono text-sm text-spice-400">
            {label(valueKeys.map((key) => entry[key]).find((value) => value != null))}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default async function CharacterPage() {
  const session = await requireSession();
  const result = await loadPortalProfile(session);
  if (result.status !== 'ok') {
    return (
      <>
        <PageHeader eyebrow="Your profile" title="Character" />
        <ProfileFailure result={result} />
      </>
    );
  }

  const { character, details } = result.profile;
  const items = inventoryItems(details.inventory);
  const equipment = items?.filter((item) => /gear|equipment|loadout|hotbar/i.test(item.group));
  const journey = journeySummary(details.journey);
  const metrics: Array<[string, unknown]> = [
    ['Solari credit', character.solarisCredit],
    ['Pocket Solari', character.pocketSolari],
    ['Intel', character.intel],
    ['Experience', character.xp],
    ['Level', character.level],
    ['Unspent skill points', character.unspentSkillPoints],
  ];

  return (
    <>
      <PageHeader eyebrow="Your profile" title={character.name}>
        <p className="font-mono text-xs uppercase tracking-widest text-sand-400">
          Level {formatNumber(character.level, 0)} · {character.guild?.name ?? 'Unaffiliated'} · {character.status}
        </p>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-6">
          <Panel title="Vitals & progression">
            <dl className="grid grid-cols-2 gap-px bg-sand-200/10">
              {metrics.map(([title, value]) => (
                <div key={title} className="bg-obsidian-900 p-4">
                  <dt className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">{title}</dt>
                  <dd className="mt-2 text-lg font-extrabold text-sand-50">
                    {formatNumber(value as number | null, 0)}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>
          <Panel title="Faction standing">
            <Facts
              data={details.factions}
              nameKeys={['faction_name', 'name', 'faction_id']}
              valueKeys={['reputation_amount', 'reputation', 'value']}
            />
          </Panel>
          <Panel title="Specializations">
            <Facts data={details.specs} nameKeys={['track_name', 'name', 'track_type']} valueKeys={['level', 'xp']} />
          </Panel>
        </div>

        <div className="grid content-start gap-6">
          <Panel title="Journey">
            {journey?.length ? (
              <dl className="grid grid-cols-2 gap-px bg-sand-200/10">
                {journey.map((group) => (
                  <div key={group.name} className="bg-obsidian-900 p-4">
                    <dt className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">{group.name}</dt>
                    <dd className="mt-2 text-lg font-extrabold text-sand-50">
                      {group.completed} <span className="text-sand-600">/ {group.total}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-sand-500">Journey readings unavailable.</p>
            )}
          </Panel>
          <Panel title="Equipment & loadout">
            {!equipment?.length ? (
              <p className="text-sm text-sand-500">
                {items ? 'No equipment reported.' : 'Equipment readings unavailable.'}
              </p>
            ) : (
              <ul className="grid gap-px bg-sand-200/10">
                {equipment.map((item, index) => {
                  const image = itemImage(item.source);
                  return (
                    <li key={`${item.id}-${index}`} className="flex items-center gap-4 bg-obsidian-900 px-4 py-3">
                      <span className="flex size-10 shrink-0 items-center justify-center bg-obsidian-950">
                        {image && (
                          <Image
                            src={image}
                            alt=""
                            width={32}
                            height={32}
                            unoptimized
                            className="size-8 object-contain"
                          />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <strong className="block truncate text-xs uppercase tracking-wide text-sand-100">
                          {item.name}
                        </strong>
                        <small className="font-mono text-[0.625rem] uppercase tracking-widest text-sand-500">
                          {item.group}
                        </small>
                      </span>
                      <b className="font-mono text-xs text-spice-400">G{item.grade}</b>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
