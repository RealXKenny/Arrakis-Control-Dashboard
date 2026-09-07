import { readdirSync, writeFileSync } from 'node:fs';
const files = readdirSync(new URL('../public/items/', import.meta.url)).filter(name => /\.(png|webp|jpg|jpeg|avif)$/i.test(name)).sort();
writeFileSync(new URL('../src/modules/portal/config/item-images.json', import.meta.url), JSON.stringify(files, null, 2) + '\n');
console.log(`Indexed ${files.length} item images`);
