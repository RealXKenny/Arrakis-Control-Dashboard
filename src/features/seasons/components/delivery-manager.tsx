'use client';
import { useState } from 'react';
import { gameRewardLabel, type Delivery, type Season } from '../contracts';

export function DeliveryManager({
  season,
  deliveries,
  enabled,
  busy,
  mutate,
}: {
  season: Season;
  deliveries: Delivery[];
  enabled: boolean;
  busy: boolean;
  mutate(payload: Record<string, unknown>): Promise<void>;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const button = 'season-button';
  return (
    <section aria-label="In-game deliveries">
      <h2>In-game deliveries</h2>
      <p>
        {enabled
          ? 'API execution is enabled. Each grant still needs independent review and explicit confirmation.'
          : 'API execution is disabled. Configure SEASON_GAME_DELIVERY_ENABLED and the administrator Console connection to enable it.'}
      </p>
      <p>
        Recipients must claim the configured reward first. Failed offline/link checks send nothing and can be retried.
        Unknown or partial outcomes are never resent automatically.
      </p>
      <form
        className="season-editor-grid"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void mutate({
            action: 'delivery-request',
            seasonId: season.id,
            owner: data.get('owner'),
            rewardId: data.get('rewardId'),
            description: data.get('description'),
          });
        }}
      >
        <label>
          Recipient dashboard account ID
          <input name="owner" required pattern="[a-zA-Z0-9_-]{1,80}" />
        </label>
        <label>
          Claimed in-game reward
          <select name="rewardId" required defaultValue="">
            <option value="" disabled>
              Select reward
            </option>
            {season.definition.rewards
              .filter((r) => r.gameReward)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {gameRewardLabel(r.gameReward!)}
                </option>
              ))}
          </select>
        </label>
        <label>
          Authorization basis
          <textarea name="description" required minLength={10} maxLength={1000} />
        </label>
        <button className={button} disabled={busy}>
          Request delivery review
        </button>
      </form>
      <div className="season-challenges">
        {deliveries.map((delivery) => {
          const act = (action: string, extra: Record<string, unknown> = {}) =>
            mutate({
              action,
              seasonId: season.id,
              deliveryId: delivery.id,
              revision: delivery.revision ?? '',
              ...extra,
            });
          const confirmation = `DELIVER ${delivery.id}`;
          return (
            <article key={delivery.id} className="season-editor-card">
              <strong>
                {delivery.owner} · {delivery.status}
              </strong>
              <p>
                {delivery.gameReward ? gameRewardLabel(delivery.gameReward) : 'Legacy proposal — execution unavailable'}
              </p>
              <p>{delivery.description}</p>
              <p>{delivery.note}</p>
              {delivery.pawnId && (
                <p>
                  Approved character {delivery.pawnId} · controller {delivery.controllerId}
                </p>
              )}
              {delivery.outcome && <p>{delivery.outcome}</p>}
              {delivery.resolutionNote && <p>Reconciliation: {delivery.resolutionNote}</p>}
              {['pending', 'needs_reconciliation'].includes(delivery.status) && (
                <label>
                  Delivery review notes
                  <textarea
                    value={notes[delivery.id] ?? ''}
                    maxLength={1000}
                    onChange={(e) => setNotes((v) => ({ ...v, [delivery.id]: e.target.value }))}
                  />
                </label>
              )}
              {delivery.status === 'pending' && (
                <div className="season-actions">
                  {[true, false].map((approve) => (
                    <button
                      key={String(approve)}
                      className={button}
                      disabled={busy || (notes[delivery.id]?.trim().length ?? 0) < 3}
                      onClick={() => act('delivery-review', { approve, note: notes[delivery.id] })}
                    >
                      {approve ? 'Approve delivery' : 'Reject delivery'}
                    </button>
                  ))}
                </div>
              )}
              {((delivery.status === 'approved' && delivery.gameReward) ||
                delivery.status === 'needs_reconciliation') && (
                <>
                  <label>
                    Type {confirmation}
                    <input
                      autoComplete="off"
                      value={confirmations[delivery.id] ?? ''}
                      onChange={(e) => setConfirmations((v) => ({ ...v, [delivery.id]: e.target.value }))}
                    />
                  </label>
                  {delivery.status === 'approved' ? (
                    <button
                      className={button}
                      disabled={busy || !enabled || confirmations[delivery.id] !== confirmation}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Send ${gameRewardLabel(delivery.gameReward!)} to character ${delivery.pawnId}? This changes game data.`,
                          )
                        )
                          void act('delivery-execute', { confirmation });
                      }}
                    >
                      Execute approved delivery
                    </button>
                  ) : (
                    <>
                      <p>
                        Check the Console audit and original character inventory/balance. A current balance alone cannot
                        prove whether this grant happened. Cancelled outcomes cannot be retried.
                      </p>
                      {[true, false].map((applied) => (
                        <button
                          key={String(applied)}
                          className={button}
                          disabled={
                            busy ||
                            confirmations[delivery.id] !== confirmation ||
                            (notes[delivery.id]?.trim().length ?? 0) < 10
                          }
                          onClick={() => {
                            if (
                              window.confirm('Permanently record this verified outcome without sending another grant?')
                            )
                              void act('delivery-resolve', { confirmation, applied, note: notes[delivery.id] });
                          }}
                        >
                          {applied ? 'Record verified delivery' : 'Record not applied and cancel'}
                        </button>
                      ))}
                    </>
                  )}
                </>
              )}
              {delivery.status === 'sending' && (
                <>
                  <p>
                    In flight. After two minutes, recover an interrupted send to reconciliation; recovery never resends.
                  </p>
                  <button className={button} disabled={busy} onClick={() => act('delivery-recover')}>
                    Recover interrupted send
                  </button>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
