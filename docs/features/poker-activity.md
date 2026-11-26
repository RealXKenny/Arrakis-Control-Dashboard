# Poker Activity

Arrakis Hold'em is a play-money Texas Hold'em table that members open as a Discord Activity: an embedded app that runs inside a voice channel or text channel. The dashboard serves the game and its API; the main bot only launches it. It is **off by default** (`POKER_ACTIVITY_ENABLED=false`).

Chips are play money. They start at 1,000 per seat, have no value, are never Solaris and never touch the Solaris Exchange ledger, the Console or any game write. Leaving and rejoining gives a fresh stack.

## How it fits together

1. A member starts the Activity from Discord's Activities menu or with the bot's `/poker` command.
2. Discord loads the dashboard through its Activity proxy at `https://<DISCORD_CLIENT_ID>.discordsays.com/?frame_id=…&instance_id=…`. The proxy (`src/proxy.ts`) rewrites exactly that launch shape to `/activity/poker`, which lets Discord frame only that page (`frame-ancestors https://discord.com https://ptb.discord.com https://canary.discord.com`, no `X-Frame-Options`). Every other page stays `frame-ancestors 'none'` and `X-Frame-Options: DENY`.
3. The page asks Discord for an authorization code with the `identify` and `guilds.members.read` scopes through a small in-house client for the Activity message protocol (`components/discord-activity-client.ts`: handshake, `READY`, `AUTHORIZE`). It mirrors Embedded App SDK 2.5.0 but does not depend on it, because the SDK pulls in zod 3 with an unpatched advisory. It accepts messages only from Discord's client origins and matches every reply to its request nonce.
4. `POST /api/v2/poker/session` exchanges the code server-side, reads the member fresh from Discord, requires `VERIFIED_MEMBER_ROLE_ID`, and asks Discord with the bot token whether the Activity instance exists, runs in `DISCORD_GUILD_ID` and includes the member. Only then does it issue a random bearer token bound to that member and that instance. The Discord access token is used once and never stored or returned.
5. The client keeps the bearer token in memory and polls `GET /api/v2/poker/table` every 1.5 seconds while visible. `POST /api/v2/poker/table` takes one action: `join`, `leave`, `deal`, `add-bot`, `remove-bot`, `fold`, `check`, `call`, `bet`, `raise` or `all-in`.

Activity iframes cannot rely on cookies, so the Activity does not use the dashboard session cookie. Signing in to the dashboard is not required, and an Activity token grants nothing outside poker.

## Rules

- No-limit Texas Hold'em, 2 to 4 seats per lobby (people and AI players together), blinds 5/10, starting stack 1,000. Heads-up the button posts the small blind and acts first before the flop.
- Side pots are built from each player's contribution; split pots give odd chips to the first winner left of the button. A short all-in raise does not reopen the betting.
- Players who join during a hand are dealt in next hand. Leaving during a hand folds the seat; the seat is removed when the hand ends.
- Shot clock: 30 seconds per turn. When it runs out the server checks if that is free and otherwise folds. Two missed turns in a row remove the player at the end of the hand, so an abandoned seat cannot stall the table.
- Any seated player can deal the next hand once at least two seated players have chips, at least one of them a person.

## AI players

- A seated player who cannot find a second person can add AI players (`ai-1` to `ai-4`) up to the four-seat limit, and remove them again. AI players are dealt in from the next hand.
- The AI runs on the server in `engine/ai.ts`: a simple, beatable heuristic from its own hole cards, the board, the pot price and a little randomness. It sees only what a person in its seat would see, and no external AI service is called.
- AI turns are played 1.2 seconds after they come due, on the next table read or action, so people can follow the action. AI players never trigger the shot clock.
- When a person joins a full table, the newest AI player gives up its seat (folding if a hand is running). When the last person leaves, every AI player leaves too, and a table of only AI players is never dealt.

## Security and limits

- Each Activity instance has one table in Redis (`arrakis:poker:table:v1:<sha256(instance)>`), retained six hours after the last change and written with a revision compare-and-set; lost races retry up to three times. Bearer tokens are stored only as SHA-256 hashes (`arrakis:poker:session:v1:<sha256(token)>`) and expire after two hours.
- Hole cards are only in the owner's view until showdown; the deck is never sent to a browser. Shuffles use Web Crypto with rejection sampling.
- Mutations require an `Origin` of `https://<DISCORD_CLIENT_ID>.discordsays.com` or `APP_URL`, bounded JSON bodies (2 KiB for sign-in, 1 KiB for actions) and strict schemas. Rejected origins are audited.
- Rate limits: 10 sign-ins per address per minute, 120 table reads and 60 actions per member per minute. Responses are `no-store`.
- Every route returns 404 and the page is not framed while `POKER_ACTIVITY_ENABLED` is not `true`.

## Setup

1. In the Discord Developer Portal, open the **bot's own application** (the Activity, the OAuth client and `DISCORD_BOT_TOKEN` must all belong to it, or the bot cannot launch it and instance checks fail).
2. Under **Activities → Settings**, enable Activities.
3. Under **Activities → URL Mappings**, map the root prefix `/` to the dashboard host from `APP_URL` without the scheme, for example `dashboard.example.com`.
4. Under **OAuth2**, the existing client secret is reused; no redirect URI is needed for Activities.
5. Set `POKER_ACTIVITY_ENABLED=true` with `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `DISCORD_BOT_TOKEN`, `VERIFIED_MEMBER_ROLE_ID` and Redis, then restart.

## Not verified live

The Activity iframe, the URL mapping and the activity-instance lookup were tested only against mocks. Before announcing it, launch it once on desktop, web and mobile and play a hand with two accounts.
