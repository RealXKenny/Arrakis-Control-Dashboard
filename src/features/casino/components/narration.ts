import type { RoundView } from '../contracts';
import type { Announcement } from '../../../lib/audio/manager';
import { casinoVoiceClips } from '../audio/voice-pack';
import { RANK_NAMES } from './playing-card';

type Hand = { cards: number[]; total: number; soft: boolean };
type BlackjackView = {
  hands: Hand[];
  dealer: number[];
  dealerHidden: boolean;
  dealerTotal: number | null;
  active: number | null;
};
const cardName = (id: number) => RANK_NAMES[id % 13].toLowerCase();

/** Only sanitized, server-confirmed views enter this function. Never inspects private game state. */
export function narrateRound(next: RoundView, previous: RoundView | null, action?: unknown): Announcement | null {
  if (previous?.id === next.id && previous.version >= next.version) return null;
  if (next.status === 'voided')
    return {
      id: `${next.id}:void`,
      text: 'Round cancelled. Your wager was returned.',
      clips: casinoVoiceClips('Round cancelled. Your wager was returned.') ?? undefined,
      priority: 4,
      sound: 'warning',
    };
  const settled = next.status === 'settled' && next.settlement !== null;
  if (next.status !== 'open' && !settled) return null;
  const result = next.settlement?.result ?? {};
  const prefix = `${next.id}:${next.version}:${next.status}`;
  let text = '';
  if (next.game === 'emperors-hand') {
    const view = next.game_view as BlackjackView;
    if (!view?.hands?.length) return null;
    const accepted = (action as { type?: string } | null)?.type;
    text =
      accepted === 'hit'
        ? 'Another card. '
        : accepted === 'double'
          ? 'Double down. '
          : accepted === 'split'
            ? 'Splitting the pair. '
            : accepted === 'stand'
              ? 'You stand. '
              : '';
    text += view.hands
      .map(
        (hand, index) =>
          `${view.hands.length > 1 ? `Hand ${index + 1}` : 'You have'} ${hand.cards.map(cardName).join(' and ')}. ${hand.soft ? 'Soft ' : ''}${hand.total}${hand.total > 21 ? '. Bust' : ''}.`,
      )
      .join(' ');
    // Dev note: the dealer keeps a poker face, even when playing Blackjack.
    if (view.dealerHidden) text += ` Dealer shows a ${cardName(view.dealer[0])}.`;
    else if (view.dealerTotal !== null)
      text += ` Dealer has ${view.dealerTotal}${view.dealerTotal > 21 ? '. Dealer busts' : ''}.`;
    if (settled && Array.isArray(result.hands))
      text += result.hands
        .map(
          (h: { outcome: string }, i: number) =>
            ` ${view.hands.length > 1 ? `Hand ${i + 1}: ` : ''}${({ blackjack: 'Blackjack. Congratulations.', win: 'You win.', lose: 'Dealer wins.', bust: 'Hand lost.', push: 'Push. Your wager is returned.' } as Record<string, string>)[h.outcome] ?? 'Hand settled.'}`,
        )
        .join('');
  } else if (next.game === 'spice-wheel' && settled) {
    const n = result.number;
    const red = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
    text = `${n}, ${n === 0 ? 'green' : red.has(Number(n)) ? 'red' : 'black'}. Bets settled.`;
  } else if (next.game === 'fate-of-arrakis' && settled)
    text = `${result.rollDisplay}. ${result.win ? 'You win.' : 'No win.'}`;
  else if (next.game === 'great-houses' && settled)
    text = `House ${result.landed === 'scarab' ? 'Scarab' : 'Crescent'} prevails. ${result.won ? 'Your prediction was correct.' : 'The other House wins.'}`;
  else if (next.game === 'spice-harvest') {
    text = settled
      ? result.outcome === 'hazard'
        ? 'Sandworm detected. Expedition lost.'
        : 'Harvest secured. Cash-out confirmed.'
      : previous
        ? 'Spice discovered.'
        : 'The harvest begins.';
  } else if (next.game === 'ornithopter-run') {
    if (previous?.status === 'open' && !settled) return null;
    text = settled
      ? result.outcome === 'crashed'
        ? 'Storm contact. Flight terminated.'
        : `Cash-out confirmed at ${(Number(result.cashedOutBps) / 10000).toFixed(2)} times.`
      : 'Flight initiated.';
  }
  if (!text) return null;
  return {
    id: prefix,
    text,
    clips: casinoVoiceClips(text) ?? undefined,
    priority: settled ? 4 : 2,
    sound: settled
      ? BigInt(next.settlement!.payout) > BigInt(next.wager) * BigInt(next.holds)
        ? 'win'
        : 'loss'
      : next.game === 'emperors-hand'
        ? 'deal'
        : 'reveal',
    persona: next.game,
  };
}
