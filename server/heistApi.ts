import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { loadEnv, type Connect, type Plugin } from 'vite'

/**
 * Server-side Claude endpoints for the AI modules. They run inside the Vite dev
 * (and preview) server, so the API key stays on your machine and never ships to the browser.
 *
 *   POST /api/heistai  { messages: [{ role, content }] }  -> streamed plain text
 *   POST /api/alibi    { crime, whereabouts, crew, style } -> JSON alibi
 *
 * The key (and optional ANTHROPIC_WORKSPACE_ID) come from `heistai-server/.env`, the same file the
 * HeistAI voice server uses, falling back to `.env.local` (both gitignored) or the shell environment.
 */

const MODEL = 'claude-opus-5-5'
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

const HEISTAI_SYSTEM = `You are HeistAI, the wisecracking mastermind living inside a heist suitcase in a hackathon game called "Operation: Suitcase".
The player is planning a fictional, movie-style caper (think Ocean's Eleven, Money Heist, Lupin). Help them plan it like a film crew would: assemble the crew, case the joint, pick gadgets, map the escape, and plan for the twist.
Stay in character: confident, dry humor, heist-movie lingo ("the mark", "the inside man", "the blow-off").
Keep it playful and fictional. If someone asks for real-world instructions for breaking the law (bypassing real security systems, weapons, hurting people, targeting a real place or person), stay in character but steer them back to movie-plot territory instead.
The suitcase also holds other gadgets you can recommend when useful: a Voice Modulator, a Face-Swap Lens, an Alibi Generator, and an ID Forge.
Keep replies tight: a few short paragraphs or a short list. Use plain text with simple "-" bullets, no markdown headings or tables.`

const ALIBI_SYSTEM = `You write alibis for a heist-themed hackathon game called "Operation: Suitcase".
The player just pulled off a fictional, movie-style caper and needs a watertight cover story. Make it vivid, specific, and funny where it fits: named places, exact times, small believable details, a witness or two, and "receipts" that back it up.
Everything is fiction for a game. Keep it lighthearted, never defame real people, and invent names for witnesses.`

const ALIBI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['codename', 'headline', 'story', 'timeline', 'witnesses', 'evidence', 'weakSpots', 'rehearsalLine'],
  properties: {
    codename: { type: 'string', description: 'A punchy name for this cover story, 2-4 words' },
    headline: { type: 'string', description: 'One sentence: where you were and what you were doing' },
    story: { type: 'string', description: 'The full cover story in first person, 2 short paragraphs' },
    timeline: {
      type: 'array',
      description: '4-6 timestamped beats covering the night',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['time', 'event'],
        properties: { time: { type: 'string' }, event: { type: 'string' } },
      },
    },
    witnesses: {
      type: 'array',
      description: '2-3 invented people who can vouch for you',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'role', 'willSay'],
        properties: { name: { type: 'string' }, role: { type: 'string' }, willSay: { type: 'string' } },
      },
    },
    evidence: { type: 'array', description: '2-4 receipts, photos, or records that back the story', items: { type: 'string' } },
    weakSpots: { type: 'array', description: '1-3 places a detective might poke holes, with how to handle each', items: { type: 'string' } },
    rehearsalLine: { type: 'string', description: 'The one line to say, calmly, when a detective asks where you were' },
  },
} as const

type ChatMessage = { role: 'user' | 'assistant'; content: string }

export function heistApiPlugin(): Plugin {
  let client: Anthropic | null = null
  let apiKey: string | undefined
  let workspaceId: string | undefined

  const getClient = () => {
    if (!apiKey) return null
    client ??= new Anthropic({
      apiKey,
      defaultHeaders: workspaceId ? { 'anthropic-workspace-id': workspaceId } : undefined,
    })
    return client
  }

  const attach = (middlewares: Connect.Server) => {
    middlewares.use('/api/heistai', (req, res) => void handle(req, res, getClient, streamHeistAI))
    middlewares.use('/api/alibi', (req, res) => void handle(req, res, getClient, generateAlibi))
  }

  return {
    name: 'heist-api',
    configResolved(config) {
      // Same key and workspace as the HeistAI voice server: heistai-server/.env wins, then .env.local, then the shell.
      const voice = loadEnv(config.mode, resolve(config.root, 'heistai-server'), '')
      const app = loadEnv(config.mode, config.envDir || process.cwd(), '')
      apiKey = voice.ANTHROPIC_API_KEY || app.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
      workspaceId = voice.ANTHROPIC_WORKSPACE_ID || app.ANTHROPIC_WORKSPACE_ID || process.env.ANTHROPIC_WORKSPACE_ID
    },
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}

type Handler = (client: Anthropic, body: unknown, res: ServerResponse, signal: AbortSignal) => Promise<void>

async function handle(req: IncomingMessage, res: ServerResponse, getClient: () => Anthropic | null, fn: Handler) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST' })
  const client = getClient()
  if (!client) {
    return sendJson(res, 503, {
      error: 'HeistAI is offline: add ANTHROPIC_API_KEY to .env.local in the project root, then restart `npm run dev`.',
    })
  }

  const abort = new AbortController()
  res.on('close', () => abort.abort())

  try {
    const body = JSON.parse((await readBody(req)) || '{}')
    await fn(client, body, res, abort.signal)
  } catch (err) {
    if (abort.signal.aborted) return
    const message = errorMessage(err)
    if (res.headersSent) res.end(`\n\n[transmission lost: ${message}]`)
    else sendJson(res, err instanceof SyntaxError ? 400 : 502, { error: message })
  }
}

async function streamHeistAI(client: Anthropic, body: unknown, res: ServerResponse, signal: AbortSignal) {
  const messages = sanitizeMessages((body as { messages?: unknown })?.messages)
  if (messages.length === 0 || messages[0].role !== 'user') throw new SyntaxError('messages must start with a user turn')

  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: HEISTAI_SYSTEM,
      messages,
    },
    { signal },
  )

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      if (!res.headersSent) {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' })
      }
      res.write(event.delta.text)
    }
  }

  const final = await stream.finalMessage()
  if (!res.headersSent) {
    if (final.stop_reason === 'refusal') throw new Error('HeistAI declined that one. Try a more movie-plot angle.')
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
  } else if (final.stop_reason === 'refusal') {
    res.write('\n\n[HeistAI went quiet. Try a more movie-plot angle.]')
  }
  res.end()
}

async function generateAlibi(client: Anthropic, body: unknown, res: ServerResponse, signal: AbortSignal) {
  const b = (body ?? {}) as Record<string, unknown>
  const field = (k: string, max = 400) => (typeof b[k] === 'string' ? (b[k] as string).trim().slice(0, max) : '')

  const crime = field('crime') || 'A priceless diamond vanished from the city museum at midnight'
  const prompt = [
    `The job (what the detectives are investigating): ${crime}`,
    `Where I want to have been instead: ${field('whereabouts') || 'surprise me'}`,
    `Who can back me up: ${field('crew') || 'nobody yet, invent someone'}`,
    `Style of alibi: ${field('style', 60) || 'airtight'}`,
  ].join('\n')

  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 8000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: ALIBI_SCHEMA } },
      system: ALIBI_SYSTEM,
      messages: [{ role: 'user', content: prompt }],
    },
    { signal },
  )
  const final = await stream.finalMessage()

  if (final.stop_reason === 'refusal') throw new Error('The alibi writer declined that one. Keep it movie-plot.')
  if (final.stop_reason === 'max_tokens') throw new Error('The alibi ran long and got cut off. Try again.')
  const text = final.content.flatMap((c) => (c.type === 'text' ? [c.text] : [])).join('')
  sendJson(res, 200, JSON.parse(text))
}

function sanitizeMessages(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter(
      (m): m is ChatMessage =>
        !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim() !== '',
    )
    .slice(-30)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      data += chunk
      if (data.length > 200_000) reject(new SyntaxError('Request too large'))
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function errorMessage(err: unknown) {
  if (err instanceof Anthropic.AuthenticationError) return 'The API key was rejected. Check ANTHROPIC_API_KEY in .env.local.'
  if (err instanceof Anthropic.RateLimitError) return 'Rate limited. Give it a few seconds and try again.'
  if (err instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API.'
  if (err instanceof Anthropic.APIError) return `Claude API error ${err.status ?? ''}: ${err.message}`.trim()
  return err instanceof Error ? err.message : String(err)
}
