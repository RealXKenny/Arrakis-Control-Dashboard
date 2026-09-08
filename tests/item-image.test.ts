import { readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import files from '../src/modules/portal/config/item-images.json';
import { itemImage } from '../src/modules/portal/utils/item-image';

it('indexes every supplied item image and resolves its exact template name', () => {
  expect(files).toEqual(
    readdirSync('public/items')
      .filter((name) => /\.(png|webp|jpg|jpeg|avif)$/i.test(name))
      .sort(),
  );
  for (const file of files) expect(itemImage({ icon: file })).toBe(`/items/${encodeURIComponent(file)}`);
});
it('matches names, prefers precise variants and keeps image requests local', () => {
  expect(itemImage({ template_name: 'Crysknife_CR', display_name: 'Crysknife' })).toBe('/items/Crysknife_CR.png');
  expect(itemImage({ name: 'Spice Melange' })).toBe('/items/MelangeSpice.png');
  expect(itemImage({ icon: 'https://provider.test/icons/Crysknife.png' })).toBe('/items/Crysknife.png');
  expect(itemImage({ icon: '../../secret', name: 'Unknown item' })).toBeNull();
  expect(itemImage({ template_id: 12345 })).toBeNull();
});
