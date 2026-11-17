import { describe, expect, it } from 'vitest';
import { canTransitionDelivery, validateChatContent } from '../../../src/features/chat/contracts';

describe('chat content and delivery state', () => {
  it('normalizes newlines and permits text without interpreting markup', () => {
    expect(validateChatContent('  hello\r\n<img src=x>  ', 100)).toBe('hello\n<img src=x>');
  });

  it('rejects empty, oversized and control-character messages', () => {
    expect(() => validateChatContent(' \n ', 100)).toThrow('Enter a message');
    expect(() => validateChatContent('a'.repeat(101), 100)).toThrow('100 characters');
    expect(() => validateChatContent('bad\u0000text', 100)).toThrow('control characters');
  });

  it('allows only honest delivery transitions', () => {
    expect(canTransitionDelivery('pending', 'published')).toBe(true);
    expect(canTransitionDelivery('pending', 'unknown')).toBe(true);
    expect(canTransitionDelivery('published', 'accepted')).toBe(true);
    expect(canTransitionDelivery('published', 'delivered')).toBe(true);
    expect(canTransitionDelivery('failed', 'published')).toBe(false);
    expect(canTransitionDelivery('unknown', 'delivered')).toBe(true);
    expect(canTransitionDelivery('unknown', 'published')).toBe(true);
    expect(canTransitionDelivery('published', 'unknown')).toBe(false);
  });
});
