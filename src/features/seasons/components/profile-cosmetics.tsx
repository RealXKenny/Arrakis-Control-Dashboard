import { readRecord, seasonKeys } from '../server/store';
import type { Reward } from '../contracts';
import { RewardArt } from './reward-art';
import '../styles/seasons.css';

export async function ProfileCosmetics({ owner }: { owner: string }) {
  const records = await loadCosmetics(owner);
  if (!records) return <p className="text-sm text-sand-400">Season cosmetics are temporarily unavailable.</p>;
  const equipped = Object.values(records);
  if (!equipped.length) return null;
  return (
    <section className="panel p-6 season-root">
      <div>
        <span className="season-kicker">Your earned recognition</span>
        <h2>Season showcase</h2>
      </div>
      <div className="season-cosmetics">
        {equipped.map((claim, i) => (
          <div key={`${claim.reward.id}-${i}`} className="season-editor-card">
            <RewardArt reward={claim.reward} />
            <strong>{claim.reward.name}</strong>
            <span className="season-kicker">{claim.reward.kind}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

async function loadCosmetics(owner: string) {
  try {
    const record = await readRecord<Record<string, { reward: Reward; seasonId: string }>>(seasonKeys.equipment(owner));
    return record.value ?? {};
  } catch {
    return null;
  }
}
