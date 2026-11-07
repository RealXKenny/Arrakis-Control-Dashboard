import { useState } from 'react';
import type { AdminOperation } from '../types';
import { fieldLabel, fieldValue, operationFields } from '../operation-fields';
import css from '../styles/admin.module.css';

export default function OperationFields({
  operation,
  query,
  body,
  disabled,
  onChange,
  onValidityChange,
}: {
  operation: AdminOperation;
  query: string;
  body: string;
  disabled: boolean;
  onChange: (location: 'query' | 'body', value: string) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  let values: Record<string, Record<string, unknown>>;
  try {
    values = { query: JSON.parse(query), body: JSON.parse(body) };
  } catch {
    return <p role="alert">Fix the JSON in Advanced request fields to use the form.</p>;
  }
  function update(field: ReturnType<typeof operationFields>[number], text: string) {
    setDrafts((current) => ({ ...current, [field.name]: text }));
    try {
      const next = { ...values[field.location] };
      const value = fieldValue(field, text);
      if (value === undefined) delete next[field.name];
      else next[field.name] = value;
      onChange(field.location, JSON.stringify(next, null, 2));
      const nextInvalid = { ...invalid };
      delete nextInvalid[field.name];
      setInvalid(nextInvalid);
      onValidityChange(!Object.keys(nextInvalid).length);
    } catch {
      setInvalid({
        ...invalid,
        [field.name]: `${fieldLabel(field.name)} needs valid ${field.type === 'json' ? 'JSON' : 'input'} before running.`,
      });
      onValidityChange(false);
    }
  }
  return (
    <div className={css.formGrid}>
      {operationFields(operation).map((field) => {
        const raw = values[field.location]?.[field.name];
        const value =
          drafts[field.name] ??
          (raw === undefined ? '' : typeof raw === 'object' ? JSON.stringify(raw, null, 2) : String(raw));
        const common = {
          value,
          disabled,
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
            update(field, event.target.value),
        };
        return (
          <label className={css.field} key={field.name}>
            {fieldLabel(field.name)}{' '}
            <span>
              {field.optional ? 'Optional' : 'Required'}
              {field.hint ? ` · ${field.hint}` : ''}
            </span>
            {field.choices || field.type === 'boolean' ? (
              <select {...common}>
                <option value="">{field.optional ? 'Use server default' : 'Choose a value'}</option>
                {(field.choices ?? ['true', 'false']).map((choice) => (
                  <option key={choice} value={choice}>
                    {choice === 'true' ? 'Yes' : choice === 'false' ? 'No' : choice}
                  </option>
                ))}
              </select>
            ) : field.type === 'json' ? (
              <textarea {...common} rows={4} spellCheck={false} placeholder="JSON array or object" />
            ) : (
              <input
                {...common}
                type={field.type === 'password' ? 'password' : 'text'}
                inputMode={field.type === 'number' ? 'decimal' : undefined}
                autoComplete="off"
                placeholder={field.name === 'confirmation' ? field.hint : undefined}
              />
            )}
          </label>
        );
      })}
      {Object.values(invalid).map((error) => (
        <p key={error} role="alert" className={css.error}>
          {error}
        </p>
      ))}
    </div>
  );
}
