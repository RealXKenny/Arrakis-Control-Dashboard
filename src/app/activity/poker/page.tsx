import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getServerEnv } from '../../../config/env';
import { PokerActivity } from '../../../features/poker/components/poker-activity';

export const metadata: Metadata = { title: 'Poker', robots: { index: false, follow: false } };

/** Discord Activity entry point. Discord frames it; the proxy rewrites the Activity's root launch URL here. */
export default function PokerActivityPage() {
  const env = getServerEnv();
  if (!env.POKER_ACTIVITY_ENABLED || !env.DISCORD_CLIENT_ID) notFound();
  return <PokerActivity clientId={env.DISCORD_CLIENT_ID} />;
}
