import { describe, expect, it } from 'vitest';
import { decodeMapChat, encodeMapChat } from '../../../src/features/chat/server/protocol';

const ID = '0123456789ABCDEF0123456789ABCDEF';

describe('bot-compatible game chat protocol', () => {
  it('preserves the exact map envelope, persona identity, timestamp and decimal origin', () => {
    const encoded = encodeMapChat(
      'ArrakisControl#0001',
      '[Dashboard] Kenny: hello',
      'Arrakis Control',
      ID,
      new Date('2026-11-08T20:01:02Z'),
    );
    expect(encoded.id).toBe(ID);
    const outer = JSON.parse(encoded.body.toString());
    expect(outer.Type).toBe('TextChat');
    expect(outer.Content).toBeUndefined();
    expect(outer.content).toContain('"m_OriginLocation":{"X":0.0,"Y":0.0,"Z":0.0}');
    expect(JSON.parse(outer.content)).toMatchObject({
      m_Id: ID,
      m_ChannelType: 'Map',
      m_UserNameTo: '',
      m_FuncomIdFrom: 'ArrakisControl#0001',
      m_bUseSpoofedUserName: true,
      m_SpoofedUserNameFrom: { m_UnlocalizedName: 'Arrakis Control' },
      m_Message: { m_UnlocalizedMessage: '[Dashboard] Kenny: hello' },
      m_Timestamp: '2026.11.08-20.01.02',
    });
    expect(decodeMapChat(encoded.body)).toEqual({
      id: ID,
      sender: 'ArrakisControl#0001',
      text: '[Dashboard] Kenny: hello',
      displayName: 'Arrakis Control',
      timestamp: '2026-11-08T20:01:02.000Z',
    });
  });

  it('accepts the bot-compatible uppercase Content field', () => {
    const encoded = encodeMapChat('Player#1234', 'hello', undefined, ID);
    const outer = JSON.parse(encoded.body.toString());
    expect(decodeMapChat(Buffer.from(JSON.stringify({ Type: 'TextChat', Content: outer.content })))).toMatchObject({
      id: ID,
      sender: 'Player#1234',
      text: 'hello',
    });
  });

  it('rejects malformed, oversized, private and non-map traffic', () => {
    const bodies = [Buffer.from('invalid'), Buffer.alloc(65_537), Buffer.from('null'), Buffer.from('{"Type":"Other"}')];
    for (const body of bodies) expect(decodeMapChat(body)).toBeNull();
    for (const channel of ['Proximity', 'Whisper', 'Guild', 'Party']) {
      const outer = JSON.parse(encodeMapChat('Player#1234', 'hello', undefined, ID).body.toString());
      const payload = JSON.parse(outer.content);
      payload.m_ChannelType = channel;
      expect(
        decodeMapChat(Buffer.from(JSON.stringify({ Type: 'TextChat', content: JSON.stringify(payload) }))),
      ).toBeNull();
    }
    const outer = JSON.parse(encodeMapChat('Player#1234', 'private', undefined, ID).body.toString());
    const payload = JSON.parse(outer.content);
    payload.m_UserNameTo = 'Recipient#1234';
    expect(
      decodeMapChat(Buffer.from(JSON.stringify({ Type: 'TextChat', content: JSON.stringify(payload) }))),
    ).toBeNull();
  });
});
