import Link from 'next/link';
import { inventoryItems, journeySummary, label, record, rows } from '../utils/inventory';
import type { buildCharacter } from '../utils/character';
import { formatNumber } from '../utils/formatting';
import css from '../dossier.module.css';

export default function CharacterDossier({
  character,
  details,
}: {
  character: ReturnType<typeof buildCharacter>;
  details: Record<string, unknown>;
}) {
  const progression = record(details.progression);
  const items = inventoryItems(details.inventory);
  const equipment = items?.filter((item) => /gear|equipment|loadout|hotbar/i.test(item.group));
  const journey = journeySummary(details.journey);
  const metrics = [
    ['Solari credit', character.solarisCredit],
    ['Pocket Solari', character.solaris],
    ['Intel', character.intel],
    ['Experience', character.xp],
    ['Level', character.level],
    ['Unspent skill points', progression.unspentSkillPoints],
  ] as const;
  return (
    <>
      <div className={`${css.panel} ${css.identity}`}>
        <span className={css.avatar} aria-hidden="true">
          ◈
        </span>
        <div>
          <h2>{character.name}</h2>
          <p>
            Level {formatNumber(character.level, 0)} · {label(record(character.guild).name, 'Unaffiliated')}
          </p>
        </div>
        <span className={css.badge}>{character.status}</span>
      </div>
      <div className={css.columns}>
        <div>
          <section className={css.panel}>
            <h2>Vitals & progression</h2>
            <dl className={css.metrics}>
              {metrics.map(([title, value]) => (
                <div key={title}>
                  <dt>{title}</dt>
                  <dd>{formatNumber(value, 0)}</dd>
                </div>
              ))}
            </dl>
          </section>
          <RecordPanel
            title="Faction standing"
            data={details.factions}
            nameKeys={['faction_name', 'name', 'faction_id']}
            valueKeys={['reputation', 'value']}
          />
          <RecordPanel
            title="Specializations"
            data={details.specs}
            nameKeys={['track_name', 'name', 'track_type']}
            valueKeys={['level', 'xp']}
          />
        </div>
        <div>
          <section className={css.panel}>
            <h2>Journey</h2>
            <p>Completed milestones by category.</p>
            {journey?.length ? (
              <dl className={css.metrics}>
                {journey.map((group) => (
                  <div key={group.name}>
                    <dt>{group.name}</dt>
                    <dd>
                      {group.completed} / {group.total}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className={css.empty}>Journey readings unavailable.</p>
            )}
          </section>
          <section className={css.panel}>
            <div className={css.toolbar}>
              <h2>Equipment & loadout</h2>
              <Link href="/portal?view=storage">Open storage ↗</Link>
            </div>
            {!equipment?.length ? (
              <p className={css.empty}>{items ? 'No equipment reported.' : 'Equipment readings unavailable.'}</p>
            ) : (
              <ul className={css.equipment}>
                {equipment.map((item, index) => (
                  <li key={`${item.id}-${index}`}>
                    <span aria-hidden="true">◇</span>
                    <div>
                      <strong>{item.name}</strong>
                      <small>{item.group}</small>
                    </div>
                    <b>G{item.grade}</b>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function RecordPanel({
  title,
  data,
  nameKeys,
  valueKeys,
}: {
  title: string;
  data: unknown;
  nameKeys: string[];
  valueKeys: string[];
}) {
  const entries = rows(data);
  return (
    <section className={css.panel}>
      <h2>{title}</h2>
      {!entries?.length ? (
        <p className={css.empty}>{entries ? 'No records reported.' : 'Readings unavailable.'}</p>
      ) : (
        <dl className={css.facts}>
          {entries.map((entry, index) => (
            <div key={index}>
              <dt>
                {label(
                  nameKeys.map((key) => entry[key]).find((value) => value != null),
                  'Unnamed record',
                )}
              </dt>
              <dd>{label(valueKeys.map((key) => entry[key]).find((value) => value != null))}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
