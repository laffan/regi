// The one place the edge functions talk to OpenAI.
//
//   OPENAI_API_KEY            required for any of it
//   OPENAI_MODEL              parsing a log line (default gpt-5.6-sol)
//   OPENAI_NUTRITION_MODEL    estimating a food's energy and macros (default: OPENAI_MODEL)
//   OPENAI_TRANSCRIBE_MODEL   voice logging (default gpt-transcribe)

export const PARSE_MODEL = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5.6-sol';
export const NUTRITION_MODEL = Deno.env.get('OPENAI_NUTRITION_MODEL') ?? PARSE_MODEL;
export const TRANSCRIBE_MODEL = Deno.env.get('OPENAI_TRANSCRIBE_MODEL') ?? 'gpt-transcribe';

export function openAIKey(): string | null {
  return Deno.env.get('OPENAI_API_KEY') ?? null;
}

/** A chat completion constrained to a JSON schema, parsed. Throws on any failure. */
export async function chatJSON<T>(opts: {
  model: string;
  system: string;
  user: string;
  name: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const key = openAIKey();
  if (!key) throw new Error('OPENAI_API_KEY not set');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      messages: [
        { role: 'system', content: opts.system },
        { role: 'user', content: opts.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: opts.name, strict: true, schema: opts.schema },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error('OpenAI returned no content');
  return JSON.parse(content) as T;
}
