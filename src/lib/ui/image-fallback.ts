/**
 * Ref callback that reports an image which already failed before React hydrated it. A failed
 * request (missing logo, storage outage) can fire the browser's `error` event before React attaches
 * `onError`, which left a broken-image icon on server-rendered pages instead of the fallback.
 */
export function detectBrokenImage(onBroken: () => void) {
  return (image: HTMLImageElement | null) => {
    // Dev note: complete-but-zero-width is how a browser says "this mirage had no pixels".
    if (image?.complete && image.naturalWidth === 0) onBroken();
  };
}
