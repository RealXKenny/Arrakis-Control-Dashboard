import type { GuildApplicationQuestion } from './requirements';

export const MAX_QUESTIONS = 8;

export const QUESTION_TYPES = [
  { value: 'shortText', label: 'Short answer' },
  { value: 'longText', label: 'Paragraph' },
  { value: 'dropdown', label: 'Dropdown' },
  { value: 'timezone', label: 'Time zone' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'number', label: 'Number' },
] as const;

export function addQuestion(questions: GuildApplicationQuestion[], id: string): GuildApplicationQuestion[] {
  return questions.length >= MAX_QUESTIONS
    ? questions
    : [...questions, { id, label: '', required: true, type: 'shortText' }];
}

export function removeQuestion(questions: GuildApplicationQuestion[], id: string): GuildApplicationQuestion[] {
  return questions.filter((question) => question.id !== id);
}

export function patchQuestion(
  questions: GuildApplicationQuestion[],
  id: string,
  patch: Partial<GuildApplicationQuestion>,
): GuildApplicationQuestion[] {
  return questions.map((question) => (question.id === id ? { ...question, ...patch } : question));
}

/** Switching type resets choices: dropdowns start with two blank ones, everything else drops them. */
export function changeQuestionType(
  questions: GuildApplicationQuestion[],
  id: string,
  type: GuildApplicationQuestion['type'],
): GuildApplicationQuestion[] {
  return questions.map((question) =>
    question.id === id
      ? { ...question, type, options: type === 'dropdown' ? (question.options ?? ['', '']) : undefined }
      : question,
  );
}

/** Trim and drop blank dropdown choices, and clear choices for every other type, before schema validation. */
export function cleanQuestions(questions: GuildApplicationQuestion[]): GuildApplicationQuestion[] {
  return questions.map((question) => ({
    ...question,
    options:
      question.type === 'dropdown'
        ? (question.options ?? []).map((option) => option.trim()).filter(Boolean)
        : undefined,
  }));
}
