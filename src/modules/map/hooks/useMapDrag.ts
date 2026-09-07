'use client';

import { useCallback, useState } from 'react';

export default function useMapDrag({ frameRef }) {
  const [drag, setDrag] = useState(null);

  const handleMouseDown = useCallback(
    (event) => {
      if (event.button !== 0) {
        return;
      }

      if (event.target.closest('.hag-map-marker')) {
        return;
      }

      const frame = frameRef.current;

      if (!frame) {
        return;
      }

      setDrag({
        x: event.clientX,
        y: event.clientY,
        left: frame.scrollLeft,
        top: frame.scrollTop,
      });
    },
    [frameRef],
  );

  const handleMouseMove = useCallback(
    (event) => {
      if (!drag || !frameRef.current) {
        return;
      }

      frameRef.current.scrollLeft = drag.left - (event.clientX - drag.x);

      frameRef.current.scrollTop = drag.top - (event.clientY - drag.y);
    },
    [drag, frameRef],
  );

  const stopDragging = useCallback(() => {
    setDrag(null);
  }, []);

  return {
    drag,
    handleMouseDown,
    handleMouseMove,
    stopDragging,
  };
}
