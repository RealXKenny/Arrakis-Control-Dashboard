import { useState } from 'react';
import { adminCall, findOperation, type AdminInput } from '../client';
import ConfirmDialog from '../components/ConfirmDialog';
import type { AdminOperation } from '../types';

export type Pending = {
  title: string;
  confirmLabel: string;
  consequences: string[];
  phrase?: string;
  danger?: boolean;
  target: string;
  run: () => Promise<unknown>;
};

export function useConfirmedAction(operations: AdminOperation[], onDone: (message: string) => void) {
  const [pending, setPending] = useState<Pending | null>(null);
  function act(id: string, input: AdminInput, spec: Omit<Pending, 'run'> & { done: string }) {
    const operation = findOperation(operations, id);
    if (!operation) return;
    setPending({
      ...spec,
      run: async () => {
        const outcome = await adminCall(operation, input);
        onDone(
          `${spec.done}${outcome.warning ? ` ${outcome.warning}` : ''}${outcome.upstreamStatus === 202 ? ' The Console queued it; it has not completed yet.' : ''}`,
        );
        setPending(null);
      },
    });
  }
  const dialog = pending && (
    <ConfirmDialog
      title={pending.title}
      target={pending.target}
      consequences={pending.consequences}
      phrase={pending.phrase}
      confirmLabel={pending.confirmLabel}
      danger={pending.danger ?? true}
      onCancel={() => setPending(null)}
      onConfirm={pending.run}
    />
  );
  return { act, dialog };
}
