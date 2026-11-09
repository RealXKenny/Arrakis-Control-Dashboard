import type { GameModule } from '../engine/types';
import { blackjack } from './blackjack';
import { coinFlip } from './coin-flip';
import { crash } from './crash';
import { dice } from './dice';
import { mines } from './mines';
import { roulette } from './roulette';

/** Playable games, by id. Each game is a pure module (see engine/types.ts). */
export const gameRegistry: Record<string, GameModule> = {
  [coinFlip.id]: coinFlip as GameModule,
  [blackjack.id]: blackjack as GameModule,
  [roulette.id]: roulette as GameModule,
  [dice.id]: dice as GameModule,
  [mines.id]: mines as GameModule,
  [crash.id]: crash as GameModule,
};
