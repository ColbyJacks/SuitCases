/**
 * Tiny damped spring for per-frame animation in useFrame.
 * Lower damping relative to stiffness gives more overshoot.
 */
export class Spring {
  value: number
  velocity = 0
  stiffness: number
  damping: number

  constructor(value: number, stiffness = 120, damping = 14) {
    this.value = value
    this.stiffness = stiffness
    this.damping = damping
  }

  step(target: number, dt: number) {
    // Sub-step so large frame gaps stay stable.
    let remaining = Math.min(dt, 0.1)
    while (remaining > 0) {
      const h = Math.min(remaining, 1 / 120)
      const accel = -this.stiffness * (this.value - target) - this.damping * this.velocity
      this.velocity += accel * h
      this.value += this.velocity * h
      remaining -= h
    }
    return this.value
  }
}
