import { CameraCapture, DEFAULT_DURATION_MS, fileExtension, formatBytes } from './capture.js';
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
let actionCaptureSession = null;
const detector = new LocalFaceDetector(elements.camera, elements.canvas, result => {
  elements.faceState.textContent = result.label;
  elements.stage.dataset.face = result.state;
  if (actionCaptureSession) {
    const action = challenge.active ? challenge.update(result) : null;
    if (!action) return;
    elements.status.textContent = action.prompt;
    if (action.startRecording) startActionRecording();
    if (action.detected && actionCaptureSession) {
      actionCaptureSession.actionDetected = true;
      detector.stop();
      completeActionCapture();
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

function completeActionCapture() {
  const session = actionCaptureSession;
  if (!session || !session.actionDetected || !session.recording) return;
  actionCaptureSession = null;
  clearTimeout(session.timeout);
  activeRecording = null;
  session.resolve(session.recording);
}

function cancelActionCapture(error) {
  const session = actionCaptureSession;
  if (!session) return;
  actionCaptureSession = null;
  clearTimeout(session.timeout);
  activeRecording?.stop('cancelled');
  activeRecording = null;
  session.reject(error);
}

function startActionRecording() {
  const session = actionCaptureSession;
  if (!session || activeRecording) return;
  try {
    detector.setMaximumFrameRate(15);
    activeRecording = capture.beginRecording(DEFAULT_DURATION_MS);
    activeRecording.result.then(recording => {
      if (actionCaptureSession !== session) return;
      if (recording.stopReason !== 'timeout') {
        cancelActionCapture(new Error('Action video recording was interrupted.'));
        return;
      }
      session.recording = recording;
      activeRecording = null;
      completeActionCapture();
    }, error => {
      if (actionCaptureSession === session) cancelActionCapture(error);
    }).finally(() => {
      detector.setMaximumFrameRate(0);
    });
  } catch (error) {
    detector.setMaximumFrameRate(0);
    cancelActionCapture(error);
  }
}

function waitForActionCapture(timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const session = { resolve, reject, recording: null, actionDetected: false, timeout: null };
    actionCaptureSession = session;
    session.timeout = setTimeout(() => {
      if (actionCaptureSession === session) cancelActionCapture(new Error('Face action was not detected in time.'));
    }, timeoutMs);
  });
}

function selectAction(action) {
  if (actionCaptureSession || activeRecording) return;
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
  cancelActionCapture(new Error('Camera stopped.'));
  activeRecording?.stop('stopped');
  activeRecording = null;
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
  challenge.start(selectedAction);
  elements.status.textContent = selectedAction === ACTIONS.BLINK ? 'Blink once' : 'Open and close your mouth';
  elements.blinkAction.disabled = true;
  elements.mouthAction.disabled = true;
  try {
    const result = await waitForActionCapture();
    if (result.stopReason !== 'timeout' || !challenge.detected) throw new Error('Face action was not detected in time.');
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    recordingUrl = URL.createObjectURL(result.blob);
    elements.recording.src = recordingUrl;
    elements.recordingTab.disabled = false;
    const format = result.mimeType.split(';')[0];
    elements.recordingFormat.textContent = result.backend === 'webcodecs-cfr' ? `${format} (CFR)` : format;
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
    cancelActionCapture(new Error('Recording ended.'));
    activeRecording = null;
    challenge.reset();
    if (capture.stream) detector.start();
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
  cancelActionCapture(new Error('Page closed.'));
  activeRecording?.stop('pagehide');
  detector.close();
  capture.stop();
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
});

if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
  elements.start.disabled = true;
  showError(new Error('Use HTTPS or localhost in a browser with camera support.'));
}
