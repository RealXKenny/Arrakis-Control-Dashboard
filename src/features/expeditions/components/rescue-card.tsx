import { Card } from '../../../components/ui/card';
import { LocalTime } from '../../../components/ui/local-time';
import { MAP_LABELS } from '../../map/maps';
import { sectorFor } from '../model';
import { RESCUE_ASSISTANCE_LABELS, type RescueCard } from '../rescue';

/** Plain React text only: requester content never renders as HTML, Markdown or automatic links. */
export function RescueCardView({ card }: { card: RescueCard }) {
  const { data } = card;
  const sector = sectorFor(data.map, data.x, data.y);
  return (
    <Card as="article" aria-label="Rescue request" className="ui-card grid gap-2 border-l-4 border-l-status-danger p-4">
      <p className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-400">Rescue request</p>
      <p className="text-lg font-semibold text-sand-50">{data.callSign}</p>
      <p className="text-sm text-sand-100">
        {MAP_LABELS[data.map]}
        {sector && ` · sector ${sector}`}
        {data.x !== null && data.y !== null && ` · ${Math.round(data.x)}, ${Math.round(data.y)}`}
        {data.place && ` · ${data.place}`}
      </p>
      <p className="text-sm text-sand-100">
        Needs: {data.assistance.map((kind) => RESCUE_ASSISTANCE_LABELS[kind]).join(', ')}
      </p>
      {data.details && <p className="whitespace-pre-wrap text-sm text-sand-200">{data.details}</p>}
      {card.expiresAt && (
        <p className="text-xs text-sand-400">
          Published <LocalTime value={card.publishedAt} /> · expires <LocalTime value={card.expiresAt} />. The location
          is what the requester entered, not a live position.
        </p>
      )}
    </Card>
  );
}
