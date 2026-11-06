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
        Add up to eight questions alongside the standard application fields. Existing applications keep their original
        questions and answers.
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
        onClick={() => onChange([...questions, { id: crypto.randomUUID(), label: '', required: true }])}
      >
        Add application question
      </button>
    </fieldset>
  );
}
