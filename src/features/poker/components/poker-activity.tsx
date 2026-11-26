'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { PlayingCard } from '../../casino/components/playing-card';
import { MAX_SEATS, type PokerTableResponse, type TableActionInput } from '../contracts';
import type { Card as PokerCard } from '../engine/cards';
import type { SeatView } from '../engine/table';
import { PokerRequestError, fetchTable, sendAction, startActivitySession } from './poker-api';

const POLL_MS = 1500;
const SUIT_INDEX: Record<PokerCard['suit'], number> = { s: 0, h: 1, d: 2, c: 3 };

/** Maps engine cards onto the casino card art: suit-major, Ace first. */
export function cardArtId(card: PokerCard | null): number | null {
  if (!card) return null;
  return SUIT_INDEX[card.suit] * 13 + (card.rank === 14 ? 0 : card.rank - 1);
}

type Phase =
  | { kind: 'connecting' }
  | { kind: 'outside' }
  | { kind: 'failed'; message: string }
  | { kind: 'ready'; token: string; playerId: string };

const STREET_LABELS: Record<string, string> = {
  waiting: 'Waiting for players',
  preflop: 'Pre-flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
  showdown: 'Showdown',
};

export function PokerActivity({ clientId }: { clientId: string }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'connecting' });
  const [state, setState] = useState<PokerTableResponse | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [raiseTo, setRaiseTo] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    async function connect() {
      const params = new URLSearchParams(window.location.search);
      if (!params.has('frame_id') || !params.has('instance_id')) {
        setPhase({ kind: 'outside' });
        return;
      }
      try {
        const { DiscordSDK } = await import('@discord/embedded-app-sdk');
        const sdk = new DiscordSDK(clientId);
        await sdk.ready();
        const { code } = await sdk.commands.authorize({
          client_id: clientId,
          response_type: 'code',
          state: '',
          scope: ['identify', 'guilds.members.read'],
        });
        const session = await startActivitySession(code, sdk.instanceId);
        if (!cancelled) setPhase({ kind: 'ready', token: session.token, playerId: session.player.id });
      } catch (error) {
        if (cancelled) return;
        setPhase({
          kind: 'failed',
          message: error instanceof PokerRequestError ? error.message : 'Discord did not finish signing you in.',
        });
      }
    }
    void connect();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const token = phase.kind === 'ready' ? phase.token : null;

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!token) return;
      try {
        setState(await fetchTable(token, signal));
      } catch (error) {
        if (signal?.aborted) return;
        if (error instanceof PokerRequestError && error.status === 401) {
          setPhase({ kind: 'failed', message: error.message });
          return;
        }
        setNotice(error instanceof PokerRequestError ? error.message : 'Lost contact with the table. Retrying.');
      }
    },
    [token],
  );

  // Poll while the Activity is visible; Discord hides the frame when the player switches away.
  useEffect(() => {
    if (!token) return;
    let controller = new AbortController();
    void refresh(controller.signal);
    const timer = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      controller.abort();
      controller = new AbortController();
      void refresh(controller.signal);
    }, POLL_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 500);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.clearInterval(clock);
    };
  }, [token, refresh]);

  const legal = state?.table.legal ?? null;
  const minRaise = legal?.minRaiseTo ?? 0;
  const maxRaise = legal?.maxRaiseTo ?? 0;
  useEffect(() => {
    setRaiseTo(minRaise);
  }, [minRaise, state?.table.street, state?.table.handNumber]);

  const act = useCallback(
    async (input: TableActionInput) => {
      if (!token || busy) return;
      setBusy(true);
      setNotice(null);
      try {
        setState(await sendAction(token, input));
      } catch (error) {
        setNotice(error instanceof PokerRequestError ? error.message : 'That did not go through. Try again.');
        void refresh();
      } finally {
        setBusy(false);
      }
    },
    [token, busy, refresh],
  );

  if (phase.kind === 'connecting') return <Centered>Joining the table…</Centered>;
  if (phase.kind === 'outside') {
    return (
      <Centered>
        Poker runs inside Discord. Start it from the Activities menu in a voice channel or with the bot&apos;s poker
        command.
      </Centered>
    );
  }
  if (phase.kind === 'failed') return <Centered>{phase.message}</Centered>;
  if (!state) return <Centered>Loading the table…</Centered>;

  const { table } = state;
  const me = table.seats.find((seat) => seat.playerId === phase.playerId) ?? null;
  const myTurn = legal !== null;
  const live = !['waiting', 'showdown'].includes(table.street);
  const seconds = state.turnDeadline ? Math.max(0, Math.ceil((state.turnDeadline - now) / 1000)) : null;
  const turnSeat = table.turn >= 0 ? table.seats[table.turn] : undefined;
  const full = table.seats.length >= MAX_SEATS;
  const hasBot = table.seats.some((seat) => seat.isBot);
  const humans = table.seats.filter((seat) => !seat.isBot).length;
  const canDeal = state.seated && !live && table.seats.filter((seat) => seat.stack > 0).length >= 2;
  const isBet = table.currentBet === 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-sand-100">Arrakis Hold&apos;em</h1>
        <p className="text-xs text-sand-400">Play money only. Chips have no value and never become Solaris.</p>
      </header>

      <Card
        as="section"
        aria-label="Table"
        className="flex flex-col items-center gap-3 rounded-lg border border-obsidian-700 bg-obsidian-900 p-4"
      >
        <p className="text-sm text-sand-300">
          {STREET_LABELS[table.street] ?? table.street}
          {table.handNumber > 0 ? ` · Hand ${table.handNumber}` : ''} · Pot {table.pot.toLocaleString()}
        </p>
        <div className="flex min-h-24 flex-wrap justify-center gap-2" aria-label="Board">
          {table.board.length === 0 ? (
            <span className="self-center text-xs text-sand-500">No community cards yet</span>
          ) : (
            table.board.map((card, index) => (
              <PlayingCard key={`${index}-${card.rank}${card.suit}`} id={cardArtId(card)} dealing={false} />
            ))
          )}
        </div>
        {turnSeat && live ? (
          <p className="text-xs text-sand-400" aria-live="polite">
            {turnSeat.playerId === phase.playerId ? 'Your turn' : `${turnSeat.displayName} to act`}
            {seconds !== null ? ` · ${seconds}s` : ''}
          </p>
        ) : null}
        {table.result ? (
          <ul className="text-center text-sm text-spice-300" aria-live="polite">
            {table.result.pots.map((pot, index) => (
              <li key={index}>
                {names(table.seats, pot.winners)} {pot.winners.length > 1 ? 'split' : 'wins'}{' '}
                {pot.amount.toLocaleString()}
                {pot.hand ? ` with ${pot.hand.toLowerCase()}` : ''}
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Players">
        {table.seats.map((seat, index) => (
          <li key={seat.playerId}>
            <Card
              as="div"
              className={`flex flex-col gap-1 rounded-md border p-2 text-xs ${
                index === table.turn && live ? 'border-spice-500' : 'border-obsidian-700'
              } bg-obsidian-900 ${seat.folded ? 'opacity-60' : ''}`}
            >
              <span className="truncate font-medium text-sand-100">
                {seat.displayName}
                {index === table.button ? ' (dealer)' : ''}
              </span>
              <span className="text-sand-300">
                {seat.stack.toLocaleString()} chips
                {seat.streetBet > 0 ? ` · bet ${seat.streetBet.toLocaleString()}` : ''}
              </span>
              <span className="text-sand-500">{seatStatus(seat)}</span>
              {seat.isBot && state.seated ? (
                <Button
                  variant="ghost"
                  className="self-start text-xs"
                  disabled={busy}
                  onClick={() => void act({ action: 'remove-bot', playerId: seat.playerId })}
                >
                  Remove AI
                </Button>
              ) : null}
              {seat.hole.length > 0 && seat.playerId !== phase.playerId ? (
                <span className="flex gap-1">
                  {seat.hole.map((card, cardIndex) => (
                    <span key={cardIndex} className="w-8">
                      <PlayingCard id={cardArtId(card)} dealing={false} />
                    </span>
                  ))}
                </span>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>

      <Card
        as="section"
        aria-label="Your seat"
        className="flex flex-col gap-3 rounded-lg border border-obsidian-700 bg-obsidian-900 p-4"
      >
        {me && me.hole.length > 0 ? (
          <div className="flex justify-center gap-2" aria-label="Your cards">
            {me.hole.map((card, index) => (
              <PlayingCard key={index} id={cardArtId(card)} dealing={false} />
            ))}
          </div>
        ) : null}

        {myTurn && legal ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="danger" disabled={busy} onClick={() => void act({ action: 'fold' })}>
                Fold
              </Button>
              {legal.canCheck ? (
                <Button variant="secondary" disabled={busy} onClick={() => void act({ action: 'check' })}>
                  Check
                </Button>
              ) : (
                <Button variant="secondary" disabled={busy} onClick={() => void act({ action: 'call' })}>
                  Call {legal.toCall.toLocaleString()}
                </Button>
              )}
              {maxRaise > minRaise ? (
                <Button
                  variant="primary"
                  disabled={busy || raiseTo < minRaise || raiseTo > maxRaise}
                  onClick={() => void act({ action: isBet ? 'bet' : 'raise', amount: raiseTo })}
                >
                  {isBet ? 'Bet' : 'Raise to'} {raiseTo.toLocaleString()}
                </Button>
              ) : null}
              <Button variant="ghost" disabled={busy} onClick={() => void act({ action: 'all-in' })}>
                All in
              </Button>
            </div>
            {maxRaise > minRaise ? (
              <label className="flex items-center gap-2 text-xs text-sand-300">
                <span className="shrink-0">{isBet ? 'Bet' : 'Raise to'}</span>
                <input
                  type="range"
                  min={minRaise}
                  max={maxRaise}
                  step={1}
                  value={raiseTo}
                  onChange={(event) => setRaiseTo(Number(event.target.value))}
                  className="w-full accent-spice-500"
                />
                <input
                  type="number"
                  min={minRaise}
                  max={maxRaise}
                  value={raiseTo}
                  onChange={(event) => setRaiseTo(Math.trunc(Number(event.target.value) || 0))}
                  className="w-24 rounded border border-obsidian-600 bg-obsidian-950 px-2 py-1 text-sand-100"
                  aria-label="Amount"
                />
              </label>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-center gap-2">
          {!state.seated ? (
            <Button variant="primary" disabled={busy || (full && !hasBot)} onClick={() => void act({ action: 'join' })}>
              {full && !hasBot ? 'Table full' : 'Take a seat'}
            </Button>
          ) : (
            <Button variant="ghost" disabled={busy} onClick={() => void act({ action: 'leave' })}>
              Leave table
            </Button>
          )}
          {state.seated && !full ? (
            <Button variant="secondary" disabled={busy} onClick={() => void act({ action: 'add-bot' })}>
              Add AI player
            </Button>
          ) : null}
          {canDeal ? (
            <Button variant="primary" disabled={busy} onClick={() => void act({ action: 'deal' })}>
              {table.street === 'showdown' ? 'Deal next hand' : 'Deal'}
            </Button>
          ) : null}
        </div>
        {state.seated && humans === 1 && !hasBot && !live ? (
          <p className="text-center text-xs text-sand-400">
            No one else here yet? Add an AI player to start a hand. A person who joins later takes an AI seat.
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="text-center text-xs text-spice-300">
            {notice}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function names(seats: readonly SeatView[], ids: readonly string[]): string {
  // Dev note: a split pot is the only time sharing the spice is mandatory.
  return ids.map((id) => seats.find((seat) => seat.playerId === id)?.displayName ?? 'A player who left').join(' and ');
}

function seatStatus(seat: SeatView): string {
  if (seat.isBot && seat.sittingOut) return 'AI · joins next hand';
  if (seat.isBot && seat.folded) return 'AI · folded';
  if (seat.isBot && seat.allIn) return 'AI · all in';
  if (seat.isBot) return 'AI player';
  if (seat.sittingOut) return 'Joins next hand';
  if (seat.folded) return 'Folded';
  if (seat.allIn) return 'All in';
  return 'In the hand';
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6 text-center text-sm text-sand-300">
      <p className="max-w-md">{children}</p>
    </div>
  );
}
