import type { PrivacyCard } from '../model';
export function CardContent({ card }: { card: PrivacyCard }) {
  switch (card.category) {
    case 'profile':
      return (
        <>
          <h3>{card.data.displayName || 'Profile draft'}</h3>
          <p>{card.data.about || 'No introduction provided.'}</p>
        </>
      );
    case 'location':
      return (
        <>
          <h3>{card.data.map}</h3>
          <p>{card.data.directions || 'No directions provided.'}</p>
          {card.data.note && <p>{card.data.note}</p>}
        </>
      );
    case 'crafting':
      return (
        <>
          <h3>Self-reported crafting</h3>
          <ul>
            {card.data.specialties.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p>{card.data.details}</p>
          {card.data.contact && <p>Contact: {card.data.contact}</p>}
        </>
      );
    case 'supply':
      return (
        <>
          <h3>Self-reported supplies</h3>
          <ul>
            {card.data.offers.map((o) => (
              <li key={o.item}>
                {o.item}: {o.quantity || 'Quantity unspecified'} {o.unit}
              </li>
            ))}
          </ul>
          <p>{card.data.details}</p>
          {card.data.contact && <p>Contact: {card.data.contact}</p>}
        </>
      );
  }
}
