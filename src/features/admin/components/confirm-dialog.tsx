import { useEffect, useRef, useState, type ReactNode } from 'react';
import { audio } from '../../../lib/audio/manager';
import { ui } from './ui';

/** Modal confirmation: states the target and consequences, optionally requires a typed phrase. */
export default function ConfirmDialog({
  title,
  target,
  consequences,
  phrase,
  confirmLabel,
  danger = true,
  disabled = false,
  children,
  onCancel,
  onConfirm,
}: {
  title: string;
  target: string;
  consequences: string[];
  phrase?: string;
  confirmLabel: string;
  danger?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm: () => Promise<unknown>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  useEffect(() => {
    const dialog = ref.current;
    // Return focus to whatever opened the dialog so keyboard users keep their place.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog && !dialog.open) {
      dialog.showModal();
      audio.play('menu');
    }
    return () => {
      dialog?.close();
      audio.play('menu');
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  async function submit() {
    setBusy(true);
    setFailure('');
    try {
      await onConfirm();
    } catch (error) {
      audio.play('warning');
      // An uncertain outcome is never retried automatically.
      setFailure(`${(error as Error).message} Check the current state before trying again.`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={ref}
      className={ui.dialog}
      aria-labelledby="admin-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="admin-dialog-title">{title}</h2>
      <p className={ui.dialogTarget}>
        Target: <strong>{target}</strong>
      </p>
      <ul>
        {consequences.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {children}
      {phrase && (
        <label className={ui.field}>
          <span>
            Type <code>{phrase}</code> to continue
          </span>
          <input autoComplete="off" value={typed} onChange={(event) => setTyped(event.target.value)} />
        </label>
      )}
      {failure && (
        <p role="alert" className={ui.error}>
          {failure}
        </p>
      )}
      <div className={ui.actions}>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={danger ? ui.danger : undefined}
          disabled={busy || disabled || (phrase !== undefined && typed !== phrase)}
          onClick={() => void submit()}
        >
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
