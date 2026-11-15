'use client';
import type { PrivacyCategory, PrivacyDrafts } from '../model';
import styles from './privacy.module.css';
export function CardEditor({
  category,
  drafts,
  setDrafts,
}: {
  category: PrivacyCategory;
  drafts: PrivacyDrafts;
  setDrafts(value: PrivacyDrafts): void;
}) {
  if (category === 'profile')
    return (
      <>
        <label>
          Shared display name
          <input
            required
            maxLength={80}
            value={drafts.profile.displayName}
            onChange={(e) => setDrafts({ ...drafts, profile: { ...drafts.profile, displayName: e.target.value } })}
          />
        </label>
        <label>
          About you
          <textarea
            maxLength={600}
            rows={4}
            value={drafts.profile.about}
            onChange={(e) => setDrafts({ ...drafts, profile: { ...drafts.profile, about: e.target.value } })}
          />
        </label>
      </>
    );
  if (category === 'location')
    return (
      <>
        <div className={styles.fields}>
          <label htmlFor="privacy-map">Shared map</label>
          <select
            id="privacy-map"
            value={drafts.location.map}
            onChange={(e) =>
              setDrafts({
                ...drafts,
                location: { ...drafts.location, map: e.target.value as PrivacyDrafts['location']['map'] },
              })
            }
          >
            <option>Hagga Basin</option>
            <option>Deep Desert</option>
            <option>Other</option>
          </select>
        </div>
        <label>
          Location description
          <textarea
            required
            maxLength={400}
            rows={3}
            value={drafts.location.directions}
            onChange={(e) => setDrafts({ ...drafts, location: { ...drafts.location, directions: e.target.value } })}
          />
        </label>
        <label>
          Location note
          <textarea
            maxLength={300}
            rows={2}
            value={drafts.location.note}
            onChange={(e) => setDrafts({ ...drafts, location: { ...drafts.location, note: e.target.value } })}
          />
        </label>
        <p className={styles.note}>
          Share only the directions you choose. Your current game position is never fetched. Location cards expire
          within 24 hours.
        </p>
      </>
    );
  if (category === 'crafting')
    return (
      <>
        <label>
          Crafting specialties (one per line, up to 10)
          <textarea
            maxLength={489}
            rows={5}
            value={drafts.crafting.specialties.join('\n')}
            onChange={(e) =>
              setDrafts({ ...drafts, crafting: { ...drafts.crafting, specialties: e.target.value.split('\n') } })
            }
          />
        </label>
        <label>
          Crafting details
          <textarea
            maxLength={600}
            rows={3}
            value={drafts.crafting.details}
            onChange={(e) => setDrafts({ ...drafts, crafting: { ...drafts.crafting, details: e.target.value } })}
          />
        </label>
        <label>
          Crafting contact (optional)
          <input
            maxLength={120}
            value={drafts.crafting.contact}
            onChange={(e) => setDrafts({ ...drafts, crafting: { ...drafts.crafting, contact: e.target.value } })}
          />
        </label>
      </>
    );
  return (
    <>
      <p className={styles.note}>
        Choose up to eight supplies to describe. Quantities are self-reported, never read from inventory or treated as
        proof of delivery.
      </p>
      {drafts.supply.offers.map((offer, index) => (
        <fieldset className={styles.offer} key={index}>
          <legend>Supply {index + 1}</legend>
          <label>
            Supply {index + 1} item
            <input
              required
              maxLength={80}
              value={offer.item}
              onChange={(e) =>
                setDrafts({
                  ...drafts,
                  supply: {
                    ...drafts.supply,
                    offers: drafts.supply.offers.map((o, i) => (i === index ? { ...o, item: e.target.value } : o)),
                  },
                })
              }
            />
          </label>
          <label>
            Supply {index + 1} quantity (optional)
            <input
              inputMode="numeric"
              maxLength={18}
              value={offer.quantity}
              onChange={(e) =>
                setDrafts({
                  ...drafts,
                  supply: {
                    ...drafts.supply,
                    offers: drafts.supply.offers.map((o, i) => (i === index ? { ...o, quantity: e.target.value } : o)),
                  },
                })
              }
            />
          </label>
          <label>
            Supply {index + 1} unit
            <input
              maxLength={24}
              value={offer.unit}
              onChange={(e) =>
                setDrafts({
                  ...drafts,
                  supply: {
                    ...drafts.supply,
                    offers: drafts.supply.offers.map((o, i) => (i === index ? { ...o, unit: e.target.value } : o)),
                  },
                })
              }
            />
          </label>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              setDrafts({
                ...drafts,
                supply: { ...drafts.supply, offers: drafts.supply.offers.filter((_, i) => i !== index) },
              })
            }
          >
            Remove supply {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={drafts.supply.offers.length >= 8}
        onClick={() =>
          setDrafts({
            ...drafts,
            supply: { ...drafts.supply, offers: [...drafts.supply.offers, { item: '', quantity: '', unit: '' }] },
          })
        }
      >
        Add supply
      </button>
      <label>
        Supply details
        <textarea
          maxLength={400}
          rows={3}
          value={drafts.supply.details}
          onChange={(e) => setDrafts({ ...drafts, supply: { ...drafts.supply, details: e.target.value } })}
        />
      </label>
      <label>
        Supply contact (optional)
        <input
          maxLength={120}
          value={drafts.supply.contact}
          onChange={(e) => setDrafts({ ...drafts, supply: { ...drafts.supply, contact: e.target.value } })}
        />
      </label>
    </>
  );
}
