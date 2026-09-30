/** Browser side of the AI modules. Talks to the dev-server endpoints in server/heistApi.ts. */

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type AlibiRequest = { crime: string; whereabouts: string; crew: string; style: string }

export type Alibi = {
  codename: string
  headline: string
  story: string
  timeline: { time: string; event: string }[]
  witnesses: { name: string; role: string; willSay: string }[]
  evidence: string[]
  weakSpots: string[]
  rehearsalLine: string
}

async function post(path: string, body: unknown, signal?: AbortSignal) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new Error(data?.error ?? `Request failed (${res.status})`)
  }
  return res
}

/** Streams HeistAI's reply, calling onText with each new chunk. Resolves with the full reply. */
export async function streamHeistAI(messages: ChatMessage[], onText: (chunk: string) => void, signal?: AbortSignal) {
  const res = await post('/api/heistai', { messages }, signal)
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader()
  let full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    full += value
    onText(value)
  }
  return full
}

export async function generateAlibi(req: AlibiRequest, signal?: AbortSignal): Promise<Alibi> {
  const res = await post('/api/alibi', req, signal)
  return res.json()
}

export function alibiToText(a: Alibi) {
  return [
    `${a.codename.toUpperCase()}`,
    a.headline,
    '',
    a.story,
    '',
    'TIMELINE',
    ...a.timeline.map((t) => `${t.time}  ${t.event}`),
    '',
    'WITNESSES',
    ...a.witnesses.map((w) => `${w.name} (${w.role}): "${w.willSay}"`),
    '',
    'EVIDENCE',
    ...a.evidence.map((e) => `- ${e}`),
    '',
    'WEAK SPOTS',
    ...a.weakSpots.map((w) => `- ${w}`),
    '',
    `If asked: "${a.rehearsalLine}"`,
  ].join('\n')
}
