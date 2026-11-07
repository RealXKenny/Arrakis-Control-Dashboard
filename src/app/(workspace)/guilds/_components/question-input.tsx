'use client';

import type { GuildApplicationQuestion } from '../../../../modules/guilds/requirements';
import {
  APPLICATION_TIME_ZONES,
  guildQuestionType,
  type GuildAnswer,
} from '../../../../modules/guilds/question-fields';
import { CheckField, Field, inputClass } from '../../_components/form-controls';

/** One guild-defined application question: short, paragraph, dropdown, time zone, checkbox or number. */
export function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: GuildApplicationQuestion;
  value: GuildAnswer | undefined;
  onChange: (value: GuildAnswer) => void;
}) {
  const type = guildQuestionType(question);
  const label = `${question.label}${question.required ? ' (required)' : ' (optional)'}`;
  const text = typeof value === 'string' ? value : '';

  if (type === 'checkbox')
    return (
      <CheckField
        label={label}
        required={question.required}
        checked={value === true}
        onChange={(next) => onChange(next)}
      />
    );

  return (
    <Field label={label}>
      {type === 'timezone' || type === 'dropdown' ? (
        <select
          required={question.required}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        >
          <option value="">{type === 'timezone' ? 'Select a time zone' : 'Select an option'}</option>
          {(type === 'timezone' ? APPLICATION_TIME_ZONES : (question.options ?? [])).map((option) => (
            <option key={option} value={option}>
              {type === 'timezone' ? option.replaceAll('_', ' ') : option}
            </option>
          ))}
        </select>
      ) : type === 'longText' ? (
        <textarea
          required={question.required}
          rows={3}
          maxLength={1000}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      ) : (
        <input
          type="text"
          inputMode={type === 'number' ? 'decimal' : 'text'}
          pattern={type === 'number' ? '-?[0-9]+([.][0-9]+)?' : undefined}
          required={question.required}
          maxLength={type === 'number' ? 100 : 200}
          value={text}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      )}
    </Field>
  );
}
