// Copies MediaPipe's WASM runtime into public/ so the face tracker loads offline, with no CDN.
import { cpSync, existsSync } from 'node:fs'

const from = 'node_modules/@mediapipe/tasks-vision/wasm'
const to = 'public/mediapipe'
if (existsSync(from)) cpSync(from, to, { recursive: true })
