import 'dotenv/config';

export type MundiReasoningEffort =
  | 'none'
  | 'minimal'
  | 'low'
  | 'medium'
  | 'high'
  | 'xhigh';

const EFFORTS: MundiReasoningEffort[] = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
];

// "gpt 5.3 luna" es el modelo que pidió el usuario. La guía de agentes de OpenAI
// no publica ese id, por eso queda configurable con OPENAI_MODEL en el .env.
export const MUNDI_DEFAULT_MODEL = 'gpt-5.3-luna';

export function readMundiConfig(env: NodeJS.ProcessEnv = process.env) {
  const apiKey = (env.OPENAI_API_KEY ?? '').trim();
  const model = (env.OPENAI_MODEL ?? '').trim() || MUNDI_DEFAULT_MODEL;
  const rawEffort = (env.OPENAI_REASONING_EFFORT ?? '').trim().toLowerCase();
  const reasoningEffort = EFFORTS.includes(rawEffort as MundiReasoningEffort)
    ? (rawEffort as MundiReasoningEffort)
    : 'high';
  const maxTurns = Number(env.MUNDI_MAX_TURNS) > 0 ? Number(env.MUNDI_MAX_TURNS) : 20;

  return {
    apiKey,
    model,
    reasoningEffort,
    maxTurns,
    configured: apiKey.length > 0 && !/^sk-x+$/i.test(apiKey),
  };
}

export type MundiConfig = ReturnType<typeof readMundiConfig>;
