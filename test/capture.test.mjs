import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DURATION_MS,
  MIME_CANDIDATES,
  clampDuration,
  createCameraConstraints,
  fileExtension,
  formatBytes,
  selectRecorderMime,
} from '../src/capture.js';
import { assessFace } from '../src/face-detector.js';
import { ACTIONS, ActionChallenge } from '../src/action-challenge.js';

test('camera constraints request a front-facing portrait stream without audio', () => {
  assert.deepEqual(createCameraConstraints(), {
    audio: false,
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: 480 },
      height: { ideal: 640 },
      frameRate: { ideal: 30 },
    },
  });
});

test('recorder format selection follows the documented capability order', () => {
  const supported = new Set(['video/webm;codecs="vp8"', 'video/webm']);
  const Recorder = { isTypeSupported: value => supported.has(value) };
  assert.equal(selectRecorderMime(Recorder), 'video/webm;codecs="vp8"');
  assert.equal(MIME_CANDIDATES.at(0), 'video/mp4;codecs="avc1.42E01E"');
  assert.equal(selectRecorderMime({ isTypeSupported: () => false }), '');
});

test('capture duration and output helpers have bounded behavior', () => {
  assert.equal(clampDuration(undefined), DEFAULT_DURATION_MS);
  assert.equal(clampDuration(1), 250);
  assert.equal(clampDuration(16000), 15000);
  assert.equal(fileExtension('video/mp4;codecs="avc1"'), 'mp4');
  assert.equal(fileExtension('video/webm'), 'webm');
  assert.equal(formatBytes(1536), '1.5 KiB');
});

function face({ width = .45, centerX = .5, centerY = .55 } = {}) {
  const points = Array.from({ length: 478 }, () => ({ x: centerX, y: centerY, z: 0 }));
  points[234] = { x: centerX - width / 2, y: centerY };
  points[454] = { x: centerX + width / 2, y: centerY };
  points[1] = { x: centerX, y: centerY };
  points[10] = { x: centerX, y: centerY - .2 };
  points[152] = { x: centerX, y: centerY + .2 };
  return points;
}

test('face assessment distinguishes missing, multiple, distance, and ready states', () => {
  assert.equal(assessFace({ faceLandmarks: [] }).state, 'missing');
  assert.equal(assessFace({ faceLandmarks: [face(), face()] }).label, 'One person only');
  assert.equal(assessFace({ faceLandmarks: [face({ width: .2 })] }).label, 'Move closer');
  assert.equal(assessFace({ faceLandmarks: [face({ width: .7 })] }).label, 'Move farther away');
  assert.equal(assessFace({ faceLandmarks: [face({ centerX: .2 })] }).label, 'Center your face');
  assert.equal(assessFace({ faceLandmarks: [face()] }).state, 'ready');
});

test('blink challenge requires open, closed, and reopened phases', () => {
  const challenge = new ActionChallenge();
  challenge.start(ACTIONS.BLINK);
  const frame = score => ({ state: 'ready', actions: { blinkLeft: score, blinkRight: score, jawOpen: 0 } });
  challenge.update(frame(.1));
  challenge.update(frame(.1));
  challenge.update(frame(.4));
  challenge.update(frame(.6));
  const result = challenge.update(frame(.1));
  assert.equal(result.detected, true);
  assert.equal(result.prompt, 'Blink detected');
});

test('mouth challenge requires opening and closing', () => {
  const challenge = new ActionChallenge();
  challenge.start(ACTIONS.MOUTH);
  const frame = score => ({ state: 'ready', actions: { blinkLeft: 0, blinkRight: 0, jawOpen: score } });
  challenge.update(frame(.05));
  challenge.update(frame(.05));
  challenge.update(frame(.3));
  challenge.update(frame(.7));
  const result = challenge.update(frame(.05));
  assert.equal(result.detected, true);
  assert.equal(result.prompt, 'Mouth action detected');
});
