'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { planRecordSchema, type PlanData, type PlanRecord } from '../model';
import type { CargoReading, FleetReport } from '../../vehicles/fleet';

class RequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function readJson(response: Response, fallback: string): Promise<unknown> {
  let value: unknown = null;
  try {
    value = await response.json();
  } catch {
    // A non-JSON body still reports the HTTP failure below.
  }
  if (!response.ok) {
    const error =
      value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string'
        ? (value as { error: string }).error
        : fallback;
    throw new RequestError(error, response.status);
  }
  return value;
}

function deadline(controller: AbortController) {
  return AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]);
}

/**
 * Loads and saves the private expedition plan. Saves replace the whole record with the last confirmed revision
 * and are never retried; a conflict keeps the local edit and asks for a refresh.
 */
export function useExpeditionPlan() {
  const [record, setRecord] = useState<PlanRecord | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(true);
  const active = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const value = planRecordSchema.parse(
        await readJson(
          await fetch('/api/v2/expeditions/plan', { cache: 'no-store', signal: deadline(controller) }),
          'Plans are unavailable.',
        ),
      );
      if (!controller.signal.aborted) setRecord(value);
    } catch (caught) {
      if (!controller.signal.aborted) {
        setRecord(null);
        setError(caught instanceof Error && caught.name !== 'ZodError' ? caught.message : 'Plans could not be read.');
      }
    } finally {
      if (active.current === controller) setBusy(false);
    }
  }, []);

  const save = useCallback(
    async (plan: PlanData, done = 'Saved.'): Promise<boolean> => {
      if (!record) return false;
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      setBusy(true);
      setError('');
      setStatus('Saving…');
      try {
        const value = planRecordSchema.parse(
          await readJson(
            await fetch('/api/v2/expeditions/plan', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ revision: record.revision, plan }),
              signal: deadline(controller),
            }),
            'Plans could not be saved.',
          ),
        );
        if (controller.signal.aborted) return false;
        setRecord(value);
        setStatus(done);
        return true;
      } catch (caught) {
        if (!controller.signal.aborted) {
          setStatus('');
          setError(
            caught instanceof RequestError && caught.status === 409
              ? 'Your plans changed in another tab. Refresh plans, then make this change again.'
              : caught instanceof Error && caught.name !== 'ZodError'
                ? `${caught.message} Your last saved plans may still be in place.`
                : 'The save result could not be confirmed. Refresh plans before trying again.',
          );
        }
        return false;
      } finally {
        if (active.current === controller) setBusy(false);
      }
    },
    [record],
  );

  useEffect(() => {
    void load();
    return () => active.current?.abort();
  }, [load]);

  return { record, plan: record?.plan ?? null, error, status, busy, load, save };
}

/** Fleet and cargo readings are fetched only on request; in-flight reads are aborted when the tab is hidden. */
export function useFleet() {
  const [fleet, setFleet] = useState<FleetReport | null>(null);
  const [cargo, setCargo] = useState<CargoReading | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);

  const run = useCallback(async <T>(url: string, apply: (value: T) => void, fallback: string) => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    try {
      const value = (await readJson(
        await fetch(url, {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
        }),
        fallback,
      )) as T;
      if (!controller.signal.aborted) apply(value);
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : fallback);
    } finally {
      if (active.current === controller) setBusy(false);
    }
  }, []);

  const checkFleet = useCallback(
    () =>
      run<FleetReport>(
        '/api/v2/vehicles/fleet',
        (value) => {
          setFleet(value);
          setCargo(null);
        },
        'Fleet reading failed.',
      ),
    [run],
  );
  const checkCargo = useCallback(
    (vehicleId: string) =>
      run<CargoReading>(
        `/api/v2/vehicles/cargo?vehicle=${encodeURIComponent(vehicleId)}`,
        setCargo,
        'Cargo reading failed.',
      ),
    [run],
  );

  useEffect(() => {
    const hide = () => {
      if (!document.hidden) return;
      active.current?.abort();
      setBusy(false);
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      active.current?.abort();
      document.removeEventListener('visibilitychange', hide);
    };
  }, []);

  return { fleet, cargo, error, busy, checkFleet, checkCargo };
}
