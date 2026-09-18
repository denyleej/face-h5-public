export const DEFAULT_DURATION_MS = 533;
export const DEFAULT_VIDEO_TARGET = Object.freeze({ width: 480, height: 640, frameRate: 30 });

export const MIME_CANDIDATES = Object.freeze([
  'video/mp4;codecs="avc1.42E01E"',
  'video/mp4;codecs="avc1"',
  'video/mp4',
  'video/webm;codecs="vp8"',
  'video/webm;codecs="vp9"',
  'video/webm',
]);

export function createCameraConstraints(target = DEFAULT_VIDEO_TARGET) {
  return {
    audio: false,
    video: {
      facingMode: { ideal: 'user' },
      width: { ideal: target.width },
      height: { ideal: target.height },
      frameRate: { ideal: target.frameRate },
    },
  };
}

export function selectRecorderMime(Recorder = globalThis.MediaRecorder) {
  if (!Recorder?.isTypeSupported) return '';
  return MIME_CANDIDATES.find(type => Recorder.isTypeSupported(type)) || '';
}

export function clampDuration(value) {
  const duration = Number(value);
  if (!Number.isFinite(duration)) return DEFAULT_DURATION_MS;
  return Math.min(15000, Math.max(250, Math.round(duration)));
}

export function fileExtension(mime = '') {
  return /^video\/mp4(?:;|$)/i.test(mime) ? 'mp4' : 'webm';
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function waitForMetadata(video) {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      video.removeEventListener('error', onError);
    };
    const onLoaded = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('Camera metadata could not be read.')); };
    video.addEventListener('loadedmetadata', onLoaded, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

export async function readVideoMetadata(blob) {
  const url = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  try {
    video.src = url;
    await new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', resolve, { once: true });
      video.addEventListener('error', () => reject(new Error('Recording metadata could not be read.')), { once: true });
    });
    return {
      width: video.videoWidth,
      height: video.videoHeight,
      durationMs: Number.isFinite(video.duration) ? video.duration * 1000 : null,
    };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

export class CameraCapture {
  constructor(video) {
    if (!video) throw new Error('A video element is required.');
    this.video = video;
    this.stream = null;
    this.recording = false;
  }

  async start() {
    if (!globalThis.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera access requires a secure browser context.');
    }
    this.stop();
    this.stream = await navigator.mediaDevices.getUserMedia(createCameraConstraints());
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await waitForMetadata(this.video);
    await this.video.play();
    return this.settings();
  }

  settings() {
    const track = this.stream?.getVideoTracks()[0];
    const settings = track?.getSettings?.() || {};
    return {
      width: settings.width || this.video.videoWidth || null,
      height: settings.height || this.video.videoHeight || null,
      frameRate: settings.frameRate || null,
      facingMode: settings.facingMode || null,
    };
  }

  async record(durationMs = DEFAULT_DURATION_MS) {
    const session = this.beginRecording(durationMs);
    return session.result;
  }

  beginRecording(maxDurationMs = 8000) {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') throw new Error('Start the camera before recording.');
    if (this.recording) throw new Error('A recording is already in progress.');
    const mimeType = selectRecorderMime();
    if (!mimeType) throw new Error('This browser cannot create a supported video recording.');

    this.recording = true;
    let recorder;
    try {
      recorder = new MediaRecorder(new MediaStream([track]), {
        mimeType,
        videoBitsPerSecond: 3_000_000,
      });
    } catch (error) {
      this.recording = false;
      throw error;
    }
    const chunks = [];
    const duration = clampDuration(maxDurationMs);
    let stopReason = 'timeout';
    const blobPromise = new Promise((resolve, reject) => {
        const timer = setTimeout(() => stop('timeout'), duration);
        recorder.addEventListener('dataavailable', event => {
          if (event.data?.size) chunks.push(event.data);
        });
        recorder.addEventListener('error', event => {
          clearTimeout(timer);
          reject(event.error || new Error('Recording failed.'));
        }, { once: true });
        recorder.addEventListener('stop', () => {
          clearTimeout(timer);
          const result = new Blob(chunks, { type: mimeType });
          if (!result.size) reject(new Error('The browser produced an empty recording.'));
          else resolve(result);
        }, { once: true });
        recorder.start(100);
      });
    const stop = reason => {
      stopReason = reason;
      if (recorder.state !== 'inactive') recorder.stop();
    };
    const result = blobPromise.then(async blob => ({
      blob,
      mimeType,
      stopReason,
      metadata: await readVideoMetadata(blob),
    })).finally(() => {
      this.recording = false;
    });
    return { stop, result };
  }

  stop() {
    for (const track of this.stream?.getTracks?.() || []) track.stop();
    this.stream = null;
    this.video.srcObject = null;
  }
}
