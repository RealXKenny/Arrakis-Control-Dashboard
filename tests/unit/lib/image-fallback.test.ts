import { describe, expect, it, vi } from 'vitest';
import { detectBrokenImage } from '../../../src/lib/ui/image-fallback';

const image = (complete: boolean, naturalWidth: number) => ({ complete, naturalWidth }) as HTMLImageElement;

describe('detectBrokenImage', () => {
  it('reports an image that failed before hydration', () => {
    const onBroken = vi.fn();
    detectBrokenImage(onBroken)(image(true, 0));
    expect(onBroken).toHaveBeenCalledOnce();
  });

  it('ignores loaded, still-loading and unmounted images', () => {
    const onBroken = vi.fn();
    const ref = detectBrokenImage(onBroken);
    ref(image(true, 96));
    ref(image(false, 0));
    ref(null);
    expect(onBroken).not.toHaveBeenCalled();
  });
});
