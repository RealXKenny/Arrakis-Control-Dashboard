import type { GuildApplicationQuestion } from './requirements';

export const APPLICATION_TIME_ZONES = ['UTC', ...Intl.supportedValuesOf('timeZone')];
export type GuildAnswer = string | boolean;
export function guildQuestionType(question: GuildApplicationQuestion) {
  return question.type ?? 'longText';
}
export function canonicalGuildQuestions(questions: GuildApplicationQuestion[]) {
  return questions.map((question) => ({
    id: question.id,
    label: question.label,
    required: question.required,
    type: guildQuestionType(question),
    ...(question.type === 'dropdown' ? { options: question.options ?? [] } : {}),
  }));
}
export function guildQuestionVersion(questions: GuildApplicationQuestion[]) {
  return JSON.stringify(canonicalGuildQuestions(questions));
}
export function guildAnswerError(questions: GuildApplicationQuestion[], answers: Record<string, GuildAnswer>) {
  if (Object.keys(answers).some((id) => !questions.some((question) => question.id === id)))
    return 'This application contains an unknown question. Refresh Guilds and try again.';
  for (const question of questions) {
    const answer = answers[question.id];
    const type = guildQuestionType(question);
    if (type === 'checkbox') {
      if ((answer !== undefined && typeof answer !== 'boolean') || (question.required && answer !== true))
        return `Check “${question.label}” to continue.`;
      continue;
    }
    if (answer !== undefined && typeof answer !== 'string') return `Enter a valid answer for “${question.label}”.`;
    const value = typeof answer === 'string' ? answer.trim() : '';
    if (!value) {
      if (question.required) return `Answer “${question.label}”.`;
      continue;
    }
    if ((type === 'shortText' && value.length > 200) || value.length > 1000)
      return `The answer to “${question.label}” is too long.`;
    if (type === 'dropdown' && !question.options?.includes(value))
      return `Choose one of the available options for “${question.label}”.`;
    if (type === 'timezone' && !APPLICATION_TIME_ZONES.includes(value))
      return `Choose a valid time zone for “${question.label}”.`;
    if (type === 'number' && (value.length > 100 || !/^-?\d+(?:\.\d+)?$/.test(value)))
      return `Enter a number for “${question.label}”.`;
  }
  return null;
}
export function formatGuildAnswer(answer: GuildAnswer | undefined) {
  return answer === true ? 'Yes' : answer === false ? 'No' : answer || 'No answer provided';
}
