# Guild recruitment and applications

## Purpose

Let a guild publish a listing, collect applications through a form the leader designs, review them, and chat privately with
applicants.

## Leader setup

In **My guild → Settings**:

1. Write the requirements (up to 2000 characters) and a contact (up to 200).
2. Build the **application form**: up to 8 questions. Question types: `shortText`, `longText`, `dropdown`, `timezone`, `checkbox`,
   `number`. Labels up to 200 characters; a dropdown has up to 30 unique choices of up to 100 characters. Numeric answers stay strings.
3. **Publish.** A listing without a form cannot accept applications (`GUILD_APPLICATION_NOT_CONFIGURED`).

## Applicant flow

On `/guilds` an applicant sees published listings and applies with a linked character. The submission stores a snapshot of
the questions' wording/type; if the leader changes the form while you apply you get a retryable `GUILD_APPLICATION_FORM_CHANGED`
conflict. One application per member per guild (`GUILD_APPLICATION_EXISTS`). Status is `pending`, `accepted` or `declined`.

## Review

- Inbox: at most 200 applications per guild (`GUILD_APPLICATION_INBOX_FULL` when full), read 20 at a time, expire 90 days after the
  last submission.
- Decisions: `accepted`, `declined`, or `remove`. A review lease (120 s) serializes decisions: a second reviewer gets
  `GUILD_APPLICATION_BUSY`. **Accepting** first adds the freshly verified character to the guild through the Console, then saves
  the status; a declined application cannot be re-declined once accepted (`GUILD_APPLICATION_ACCEPTED`) — manage the member in My guild.
- Removing an application deletes it and its chat.

## Private chat

Each application has a conversation between the applicant and the guild leader: at most 100 messages of 1000 characters,
retried sends are de-duplicated by `clientMessageId`, and the chat expires with the application. Only the applicant, a freshly
verified current leader, or the separate administrator route can read it. The browser polls while visible, backs off on failure, keeps
failed drafts and acknowledges exactly the messages it displayed (read receipts).

## Requirements and permissions

Linked character, member role; leaders as in [guilds](guilds.md#roles-and-permissions).

## Limitations

Redis-only storage; applications are lost with Redis. Dashboard administrators can inspect any guild's applications and chats
(and the inspection is logged), see [administrator panel](administrator-panel.md#guild-oversight).

## Troubleshooting

`LINKED_PLAYER_REQUIRED`: link your character first. `GUILD_NOT_RECRUITING`: the listing is unpublished. `PLAYER_VERIFICATION_UNAVAILABLE`: the Console could not verify you right now.

## Related

[API: guilds](../api/guilds.md) · [Notifications](notifications.md)
