'use client';

import { useEffect, useRef } from 'react';
import { audio } from './manager';

/** Existing visible notifications own their message; audio carries only a nonverbal category. */
export function useFeedbackSound(error = '', status = '') {
  const previous = useRef({ error, status });
  useEffect(() => {
    if (error && error !== previous.current.error) audio.play('warning');
    else if (status && status !== previous.current.status) audio.play('win');
    previous.current = { error, status };
  }, [error, status]);
}
