import type { GuildApplicationQuestion } from '../requirements';
import css from '../styles/requirements.module.css';

export default function GuildQuestionEditor({
  questions,
  onChange,
}: {
  questions: GuildApplicationQuestion[];
  onChange: (questions: GuildApplicationQuestion[]) => void;
}) {
  return (
    <fieldset className={css.questions}>
      <legend>Application questions</legend>
      <p>
        Build the entire application with up to eight questions. Add at least one to enable applications. Existing
        applications keep their original questions and answers.
      </p>
      {questions.map((question, index) => (
        <fieldset key={question.id} className={css.question}>
          <legend>Question {index + 1}</legend>
          <label>
            Question text
            <input
              required
              maxLength={200}
              value={question.label}
              onChange={(event) =>
                onChange(
                  questions.map((current) =>
                    current.id === question.id ? { ...current, label: event.target.value } : current,
                  ),
                )
              }
            />
          </label>
          <label>
            Question type
            <select
              value={question.type ?? 'longText'}
              onChange={(event) =>
                onChange(
                  questions.map((current) =>
                    current.id === question.id
                      ? {
                          ...current,
                          type: event.target.value as GuildApplicationQuestion['type'],
                          options: event.target.value === 'dropdown' ? (current.options ?? ['', '']) : undefined,
                        }
                      : current,
                  ),
                )
              }
            >
              <option value="shortText">Short answer</option>
              <option value="longText">Paragraph</option>
              <option value="dropdown">Dropdown</option>
              <option value="timezone">Time zone</option>
              <option value="checkbox">Checkbox</option>
              <option value="number">Number</option>
            </select>
          </label>
          {question.type === 'dropdown' && (
            <label>
              Choices (one per line)
              <textarea
                required
                rows={4}
                maxLength={3030}
                value={(question.options ?? []).join('\n')}
                placeholder={'First choice\nSecond choice'}
                onChange={(event) =>
                  onChange(
                    questions.map((current) =>
                      current.id === question.id ? { ...current, options: event.target.value.split('\n') } : current,
                    ),
                  )
                }
              />
            </label>
          )}
          {question.type === 'timezone' && (
            <p>Applicants choose from the full supported time-zone list, including UTC.</p>
          )}
          <label className={css.checkbox}>
            <input
              type="checkbox"
              checked={question.required}
              onChange={(event) =>
                onChange(
                  questions.map((current) =>
                    current.id === question.id ? { ...current, required: event.target.checked } : current,
                  ),
                )
              }
            />
            Required answer
          </label>
          <button type="button" onClick={() => onChange(questions.filter((current) => current.id !== question.id))}>
            Remove question {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        disabled={questions.length >= 8}
        onClick={() =>
          onChange([...questions, { id: crypto.randomUUID(), label: '', required: true, type: 'shortText' }])
        }
      >
        Add application question
      </button>
    </fieldset>
  );
}
