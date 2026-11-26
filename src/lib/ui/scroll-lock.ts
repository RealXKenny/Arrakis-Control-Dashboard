type Lock = { count: number; value: string; priority: string };
const locks = new WeakMap<HTMLElement, Lock>();

/** Each overlay releases only its own lock, even when overlays close out of order. */
export function lockPageScroll(body: HTMLElement): () => void {
  let lock = locks.get(body);
  if (!lock) {
    lock = {
      count: 0,
      value: body.style.getPropertyValue('overflow'),
      priority: body.style.getPropertyPriority('overflow'),
    };
    locks.set(body, lock);
    body.style.setProperty('overflow', 'hidden');
  }
  lock.count++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--lock.count) return;
    if (lock.value) body.style.setProperty('overflow', lock.value, lock.priority);
    else body.style.removeProperty('overflow');
    locks.delete(body);
  };
}
