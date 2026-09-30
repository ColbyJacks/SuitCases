// Real-time pitch shifter: two crossfaded read heads sweep across a delay
// line. Reading faster than we write raises pitch, slower lowers it.
class PitchShifterProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'pitch', defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: 'k-rate' }]
  }

  constructor() {
    super()
    this.size = 8192
    this.buffer = new Float32Array(this.size)
    this.writeIndex = 0
    this.phase = 0
    this.window = 1536
  }

  read(delay) {
    let pos = this.writeIndex - delay
    while (pos < 0) pos += this.size
    const i = Math.floor(pos)
    const frac = pos - i
    const a = this.buffer[i % this.size]
    const b = this.buffer[(i + 1) % this.size]
    return a + (b - a) * frac
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0] && inputs[0][0]
    const output = outputs[0]
    const out = output[0]
    if (!input) {
      for (const ch of output) ch.fill(0)
      return true
    }

    const ratio = parameters.pitch[0]
    const step = (1 - ratio) / this.window

    for (let i = 0; i < input.length; i++) {
      this.buffer[this.writeIndex] = input[i]

      if (Math.abs(ratio - 1) < 0.001) {
        out[i] = input[i]
      } else {
        this.phase += step
        this.phase -= Math.floor(this.phase)
        const p2 = (this.phase + 0.5) % 1
        const g1 = 1 - Math.abs(2 * this.phase - 1)
        const g2 = 1 - Math.abs(2 * p2 - 1)
        out[i] = this.read(this.phase * this.window) * g1 + this.read(p2 * this.window) * g2
      }

      this.writeIndex = (this.writeIndex + 1) % this.size
    }

    for (let c = 1; c < output.length; c++) output[c].set(out)
    return true
  }
}

registerProcessor('pitch-shifter', PitchShifterProcessor)
