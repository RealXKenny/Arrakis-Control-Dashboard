import { afterEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { Button } from '../../../src/components/ui/button';
import { Card } from '../../../src/components/ui/card';
import { lockPageScroll } from '../../../src/lib/ui/scroll-lock';
import { downloadBlob } from '../../../src/lib/ui/download';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('preserves native button submission, disabled state, ARIA and specialized styling', () => {
  const submit = renderToStaticMarkup(
    createElement(
      Button,
      { type: 'submit', name: 'save', value: 'yes', disabled: true, 'aria-label': 'Save', className: 'map-tool' },
      'Save',
    ),
  );
  expect(submit).toContain('<button');
  expect(submit).toContain('type="submit"');
  expect(submit).toContain('name="save"');
  expect(submit).toContain('value="yes"');
  expect(submit).toContain('disabled=""');
  expect(submit).toContain('aria-label="Save"');
  expect(submit).toContain('map-tool');
  expect(submit).not.toContain('btn-ghost');
  expect(renderToStaticMarkup(createElement(Button, null, 'Submit'))).not.toContain('type=');
});

it('renders cards with the requested native landmark without leaking component options', () => {
  const markup = renderToStaticMarkup(
    createElement(Card, { as: 'section', 'aria-label': 'Resources', className: 'resources-card' }, 'Details'),
  );
  expect(markup).toBe('<section aria-label="Resources" class="resources-card">Details</section>');
  expect(renderToStaticMarkup(createElement(Card, null, 'Content'))).toContain('<article class="ui-card">');
});

function bodyStyle(initial = '', priority = '') {
  const values = new Map(initial ? [['overflow', initial]] : []);
  const priorities = new Map(initial ? [['overflow', priority]] : []);
  return {
    style: {
      getPropertyValue: (name: string) => values.get(name) ?? '',
      getPropertyPriority: (name: string) => priorities.get(name) ?? '',
      setProperty: (name: string, value: string, important = '') => {
        values.set(name, value);
        priorities.set(name, important);
      },
      removeProperty: (name: string) => {
        values.delete(name);
        priorities.delete(name);
      },
    },
  } as unknown as HTMLElement;
}

it('keeps nested overlays locked when released out of order and restores the exact prior style', () => {
  const body = bodyStyle('scroll', 'important');
  const first = lockPageScroll(body);
  const second = lockPageScroll(body);
  first();
  first();
  expect(body.style.getPropertyValue('overflow')).toBe('hidden');
  second();
  expect(body.style.getPropertyValue('overflow')).toBe('scroll');
  expect(body.style.getPropertyPriority('overflow')).toBe('important');
  const next = lockPageScroll(body);
  next();
  expect(body.style.getPropertyValue('overflow')).toBe('scroll');
});

it('removes a temporary scroll style and keeps separate documents independent', () => {
  const first = bodyStyle();
  const second = bodyStyle('auto');
  const unlockFirst = lockPageScroll(first);
  const unlockSecond = lockPageScroll(second);
  unlockFirst();
  expect(first.style.getPropertyValue('overflow')).toBe('');
  expect(second.style.getPropertyValue('overflow')).toBe('hidden');
  unlockSecond();
  expect(second.style.getPropertyValue('overflow')).toBe('auto');
});

function downloadFixture(fail = false) {
  vi.useFakeTimers();
  const link = {
    href: '',
    download: '',
    hidden: false,
    click: vi.fn(() => {
      if (fail) throw new Error('Browser refused download');
    }),
    remove: vi.fn(),
  };
  const append = vi.fn();
  const createObjectURL = vi.fn(() => 'blob:local-test');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('document', { body: { append }, createElement: vi.fn(() => link) });
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  return { link, append, createObjectURL, revokeObjectURL };
}

it('downloads only the supplied Blob through an attached temporary anchor and releases memory afterward', () => {
  const fixture = downloadFixture();
  const blob = new Blob(['{}'], { type: 'application/json' });
  downloadBlob(blob, 'colors.json');
  expect(fixture.createObjectURL).toHaveBeenCalledWith(blob);
  expect(fixture.append).toHaveBeenCalledWith(fixture.link);
  expect(fixture.link.download).toBe('colors.json');
  expect(fixture.link.click).toHaveBeenCalledOnce();
  expect(fixture.link.remove).toHaveBeenCalledOnce();
  expect(fixture.revokeObjectURL).not.toHaveBeenCalled();
  vi.runAllTimers();
  expect(fixture.revokeObjectURL).toHaveBeenCalledWith('blob:local-test');
});

it('cleans failed downloads and rejects path/control filenames before allocating a Blob URL', () => {
  const fixture = downloadFixture(true);
  const blob = new Blob(['{}']);
  for (const filename of ['', '../private.json', 'folder\\private.json', 'bad\nname', '..', 'x'.repeat(181)])
    expect(() => downloadBlob(blob, filename)).toThrow('Invalid download filename');
  expect(fixture.createObjectURL).not.toHaveBeenCalled();
  expect(() => downloadBlob(blob, 'data.json')).toThrow('Browser refused download');
  expect(fixture.link.remove).toHaveBeenCalledOnce();
  vi.runAllTimers();
  expect(fixture.revokeObjectURL).toHaveBeenCalledOnce();
});
