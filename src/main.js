import { CameraCapture, fileExtension, formatBytes } from './capture.js';
import { LocalFaceDetector } from './face-detector.js';
import { ACTIONS, ActionChallenge } from './action-challenge.js';

const elements = {
  camera: document.querySelector('#camera'),
  recording: document.querySelector('#recording'),
  canvas: document.querySelector('#landmarks'),
  stage: document.querySelector('#media-stage'),
  status: document.querySelector('#stage-status'),
  empty: document.querySelector('#empty-state'),
  cameraTab: document.querySelector('#camera-tab'),
  recordingTab: document.querySelector('#recording-tab'),
  start: document.querySelector('#start-camera'),
  stop: document.querySelector('#stop-camera'),
  record: document.querySelector('#record-video'),
  blinkAction: document.querySelector('#blink-action'),
  mouthAction: document.querySelector('#mouth-action'),
  download: document.querySelector('#download-recording'),
  error: document.querySelector('#error-message'),
  cameraResolution: document.querySelector('#camera-resolution'),
  cameraFps: document.querySelector('#camera-fps'),
  modelState: document.querySelector('#model-state'),
  faceState: document.querySelector('#face-state'),
  recordingFormat: document.querySelector('#recording-format'),
  recordingAction: document.querySelector('#recording-action'),
  recordingResolution: document.querySelector('#recording-resolution'),
  recordingDuration: document.querySelector('#recording-duration'),
  recordingSize: document.querySelector('#recording-size'),
};

const capture = new CameraCapture(elements.camera);
const challenge = new ActionChallenge();
let selectedAction = ACTIONS.BLINK;
let activeRecording = null;
let completingChallenge = false;
const detector = new LocalFaceDetector(elements.camera, elements.canvas, result => {
  elements.faceState.textContent = result.label;
  elements.stage.dataset.face = result.state;
  if (activeRecording) {
    const action = challenge.update(result);
    elements.status.textContent = action.prompt;
    if (action.detected && !completingChallenge) {
      completingChallenge = true;
      setTimeout(() => activeRecording?.stop('detected'), 250);
    }
  } else if (elements.stage.dataset.view !== 'recording') elements.status.textContent = result.label;
});
let recordingUrl = '';

function showError(error) {
  elements.error.textContent = error?.message || 'The operation could not be completed.';
  elements.error.hidden = false;
}

function clearError() {
  elements.error.textContent = '';
  elements.error.hidden = true;
}

function selectAction(action) {
  if (activeRecording) return;
  selectedAction = action;
  const blink = action === ACTIONS.BLINK;
  elements.blinkAction.classList.toggle('is-active', blink);
  elements.mouthAction.classList.toggle('is-active', !blink);
  elements.blinkAction.setAttribute('aria-pressed', String(blink));
  elements.mouthAction.setAttribute('aria-pressed', String(!blink));
}

function showView(view) {
  const recording = view === 'recording';
  elements.stage.dataset.view = recording ? 'recording' : 'camera';
  elements.cameraTab.classList.toggle('is-active', !recording);
  elements.recordingTab.classList.toggle('is-active', recording);
  elements.cameraTab.setAttribute('aria-selected', String(!recording));
  elements.recordingTab.setAttribute('aria-selected', String(recording));
  elements.recording.hidden = !recording;
  if (recording) {
    elements.recording.currentTime = 0;
    void elements.recording.play().catch(() => {});
    elements.status.textContent = 'Recorded preview';
  } else {
    elements.recording.pause();
    elements.status.textContent = elements.faceState.textContent === '-' ? 'Camera active' : elements.faceState.textContent;
  }
}

async function startCamera() {
  clearError();
  elements.start.disabled = true;
  elements.status.textContent = 'Starting camera';
  try {
    const settings = await capture.start();
    elements.stage.dataset.state = 'active';
    elements.cameraResolution.textContent = settings.width && settings.height ? `${settings.width} x ${settings.height}` : 'Available';
    elements.cameraFps.textContent = settings.frameRate ? `${settings.frameRate.toFixed(2)} fps` : 'Device managed';
    elements.stop.disabled = false;
    elements.record.disabled = false;
    elements.modelState.textContent = 'Loading';
    elements.status.textContent = 'Loading face model';
    await detector.load();
    elements.modelState.textContent = 'Ready';
    detector.start();
    showView('camera');
  } catch (error) {
    elements.start.disabled = false;
    elements.modelState.textContent = 'Unavailable';
    elements.stage.dataset.state = 'idle';
    showError(error);
    elements.status.textContent = 'Camera unavailable';
  }
}

function stopCamera() {
  detector.stop();
  capture.stop();
  elements.stage.dataset.state = recordingUrl ? 'recorded' : 'idle';
  delete elements.stage.dataset.face;
  elements.start.disabled = false;
  elements.stop.disabled = true;
  elements.record.disabled = true;
  elements.cameraResolution.textContent = '-';
  elements.cameraFps.textContent = '-';
  elements.faceState.textContent = '-';
  if (!recordingUrl) elements.status.textContent = 'Ready';
}

async function recordVideo() {
  clearError();
  elements.record.disabled = true;
  elements.start.disabled = true;
  elements.stop.disabled = true;
  completingChallenge = false;
  challenge.start(selectedAction);
  elements.status.textContent = selectedAction === ACTIONS.BLINK ? 'Blink once' : 'Open and close your mouth';
  elements.blinkAction.disabled = true;
  elements.mouthAction.disabled = true;
  try {
    activeRecording = capture.beginRecording(8000);
    const result = await activeRecording.result;
    if (result.stopReason !== 'detected' || !challenge.detected) throw new Error('Face action was not detected in time.');
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    recordingUrl = URL.createObjectURL(result.blob);
    elements.recording.src = recordingUrl;
    elements.recordingTab.disabled = false;
    elements.recordingFormat.textContent = result.mimeType.split(';')[0];
    elements.recordingAction.textContent = selectedAction === ACTIONS.BLINK ? 'Blink' : 'Open mouth';
    elements.recordingResolution.textContent = result.metadata.width && result.metadata.height
      ? `${result.metadata.width} x ${result.metadata.height}` : '-';
    elements.recordingDuration.textContent = result.metadata.durationMs === null ? '-' : `${result.metadata.durationMs.toFixed(0)} ms`;
    elements.recordingSize.textContent = formatBytes(result.blob.size);
    elements.download.href = recordingUrl;
    elements.download.download = `face-capture.${fileExtension(result.mimeType)}`;
    elements.download.hidden = false;
    elements.stage.dataset.state = 'recorded';
    showView('recording');
  } catch (error) {
    showError(error);
    elements.status.textContent = 'Recording failed';
  } finally {
    activeRecording = null;
    completingChallenge = false;
    challenge.reset();
    elements.blinkAction.disabled = false;
    elements.mouthAction.disabled = false;
    elements.record.disabled = !capture.stream;
    elements.start.disabled = Boolean(capture.stream);
    elements.stop.disabled = !capture.stream;
  }
}

elements.start.addEventListener('click', startCamera);
elements.stop.addEventListener('click', stopCamera);
elements.record.addEventListener('click', recordVideo);
elements.blinkAction.addEventListener('click', () => selectAction(ACTIONS.BLINK));
elements.mouthAction.addEventListener('click', () => selectAction(ACTIONS.MOUTH));
elements.cameraTab.addEventListener('click', () => showView('camera'));
elements.recordingTab.addEventListener('click', () => showView('recording'));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && capture.stream) stopCamera();
});
window.addEventListener('pagehide', () => {
  detector.close();
  capture.stop();
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
});

if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
  elements.start.disabled = true;
  showError(new Error('Use HTTPS or localhost in a browser with camera support.'));
}
