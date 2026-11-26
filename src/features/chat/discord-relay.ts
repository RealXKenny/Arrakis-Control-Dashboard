/** Parse the reference bot's relay format only after its Funcom identity matches exactly. */
export function parseDiscordRelay(
  senderId: string | undefined,
  text: string,
  botFuncomId: string | undefined,
): { senderName: string; content: string } | null {
  if (!botFuncomId || senderId !== botFuncomId) return null;
  // [Owner] is the bot's presentation tag, never dashboard authorization or a role claim.
  const match = /^\[Discord\] (?:\[Owner\] )?([^\r\n]{1,80}?): ([\s\S]+)$/.exec(text);
  if (!match || !match[1].trim() || !match[2].trim() || /[\u0000-\u001f\u007f]/u.test(match[1])) return null;
  return { senderName: match[1].trim(), content: match[2] };
}
