export const ACTIONS = Object.freeze({ BLINK: 'blink', MOUTH: 'mouth' });

export class ActionChallenge {
  constructor() {
    this.reset();
  }

  start(action) {
    if (!Object.values(ACTIONS).includes(action)) throw new Error('Unsupported face action.');
    this.action = action;
    this.phase = 'baseline';
    this.active = true;
    this.detected = false;
    this.baselineFrames = 0;
    return this.status();
  }

  reset() {
    this.action = ACTIONS.BLINK;
    this.phase = 'idle';
    this.active = false;
    this.detected = false;
    this.baselineFrames = 0;
  }

  status(label, startRecording = false) {
    const prompt = label || (this.action === ACTIONS.BLINK ? 'Blink once' : 'Open and close your mouth');
    return { active: this.active, detected: this.detected, action: this.action, phase: this.phase, prompt, startRecording };
  }

  update(face) {
    if (!this.active) return this.status('Start a challenge');
    if (face?.state !== 'ready') {
      this.phase = 'baseline';
      this.baselineFrames = 0;
      return this.status(face?.label || 'Position your face');
    }
    return this.action === ACTIONS.BLINK ? this.updateBlink(face.actions) : this.updateMouth(face.actions);
  }

  updateBlink(actions = {}) {
    const left = actions.blinkLeft, right = actions.blinkRight;
    if (![left, right].every(Number.isFinite)) return this.status('Keep your face visible');
    const score = (left + right) / 2;
    if (this.phase === 'baseline') {
      this.baselineFrames = score < .25 ? this.baselineFrames + 1 : 0;
      if (this.baselineFrames >= 2) this.phase = 'open';
      return this.status('Blink once');
    }
    if (this.phase === 'open' && score > .35) {
      this.phase = 'closing';
      return this.status('Blink once', true);
    }
    if (this.phase === 'closing' && score > .45) this.phase = 'closed';
    if (this.phase === 'closed' && score < .30) return this.complete('Blink detected');
    return this.status(this.phase === 'closed' ? 'Open your eyes' : 'Blink once');
  }

  updateMouth(actions = {}) {
    const score = actions.jawOpen;
    if (!Number.isFinite(score)) return this.status('Keep your face visible');
    if (this.phase === 'baseline') {
      this.baselineFrames = score < .15 ? this.baselineFrames + 1 : 0;
      if (this.baselineFrames >= 2) this.phase = 'closed';
      return this.status('Open your mouth');
    }
    if (this.phase === 'closed' && score > .25) {
      this.phase = 'opening';
      return this.status('Open your mouth', true);
    }
    if (this.phase === 'opening' && score > .55) this.phase = 'open';
    if (this.phase === 'open' && score < .12) return this.complete('Mouth action detected');
    return this.status(this.phase === 'open' ? 'Close your mouth' : 'Open your mouth');
  }

  complete(prompt) {
    this.detected = true;
    this.active = false;
    this.phase = 'complete';
    return this.status(prompt);
  }
}
