'use client';

import {
  addQuestion,
  changeQuestionType,
  MAX_QUESTIONS,
  patchQuestion,
  QUESTION_TYPES,
  removeQuestion,
} from '../questions';
import type { GuildApplicationQuestion } from '../requirements';
import { CheckField, Field, inputClass } from '../../../components/ui/form-controls';

/** Builds the whole application: up to eight questions of six types. Pure edits live in features/guilds/questions. */
export function QuestionEditor({
  questions,
  onChange,
}: {
  questions: GuildApplicationQuestion[];
  onChange: (questions: GuildApplicationQuestion[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-4 border border-sand-200/15 p-4">
      <legend className="px-2 font-mono text-[0.6875rem] uppercase tracking-widest text-spice-400">
        Application questions
      </legend>
      <p className="text-sm text-sand-400">
        Build the entire application with up to {MAX_QUESTIONS} questions. Add at least one to enable applications.
        Existing applications keep their original questions and answers.
      </p>
      {questions.map((question, index) => (
        <fieldset key={question.id} className="flex flex-col gap-4 border border-sand-200/10 bg-obsidian-900/60 p-4">
          <legend className="px-2 text-xs font-bold uppercase tracking-[0.2em] text-sand-300">
            Question {index + 1}
          </legend>
          <Field label="Question text">
            <input
              required
              maxLength={200}
              value={question.label}
              onChange={(event) => onChange(patchQuestion(questions, question.id, { label: event.target.value }))}
              className={inputClass}
            />
          </Field>
          <Field label="Question type">
            <select
              value={question.type ?? 'longText'}
              onChange={(event) =>
                onChange(
                  changeQuestionType(questions, question.id, event.target.value as GuildApplicationQuestion['type']),
                )
              }
              className={inputClass}
            >
              {QUESTION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </Field>
          {question.type === 'dropdown' && (
            <Field label="Choices (one per line)">
              <textarea
                required
                rows={4}
                maxLength={3030}
                value={(question.options ?? []).join('\n')}
                placeholder={'First choice\nSecond choice'}
                onChange={(event) =>
                  onChange(patchQuestion(questions, question.id, { options: event.target.value.split('\n') }))
                }
                className={inputClass}
              />
            </Field>
          )}
          {question.type === 'timezone' && (
            <p className="text-xs text-sand-500">
              Applicants choose from the full supported time-zone list, including UTC.
            </p>
          )}
          <CheckField
            label="Required answer"
            checked={question.required}
            onChange={(required) => onChange(patchQuestion(questions, question.id, { required }))}
          />
          <button
            type="button"
            className="btn btn-ghost self-start"
            onClick={() => onChange(removeQuestion(questions, question.id))}
          >
            Remove question {index + 1}
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        className="btn btn-ghost self-start disabled:opacity-50"
        disabled={questions.length >= MAX_QUESTIONS}
        onClick={() => onChange(addQuestion(questions, crypto.randomUUID()))}
      >
        Add application question
      </button>
    </fieldset>
  );
}
