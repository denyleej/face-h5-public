import { ArrayBufferTarget, Muxer } from 'mp4-muxer';

export const DEFAULT_DURATION_MS = 533;
export const DEFAULT_VIDEO_TARGET = Object.freeze({ width: 480, height: 640, frameRate: 30 });
export const CFR_FRAME_RATE = 30;
export const VIDEO_BITS_PER_SECOND = 1_000_000;

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

export function recordingFrameCount(durationMs = DEFAULT_DURATION_MS, frameRate = CFR_FRAME_RATE) {
  return Math.max(1, Math.round(clampDuration(durationMs) * frameRate / 1000));
}

export function cfrFrameTiming(index, frameRate = CFR_FRAME_RATE) {
  if (!Number.isInteger(index) || index < 0 || !Number.isFinite(frameRate) || frameRate <= 0) {
    throw new Error('CFR frame timing input is invalid.');
  }
  const timestamp = Math.round(index * 1_000_000 / frameRate);
  const nextTimestamp = Math.round((index + 1) * 1_000_000 / frameRate);
  return { timestamp, duration: nextTimestamp - timestamp };
}

export function avcCodecCandidates(width, height, frameRate = CFR_FRAME_RATE) {
  const macroblocksPerSecond = Math.ceil(width / 16) * Math.ceil(height / 16) * frameRate;
  const level = macroblocksPerSecond > 40500 ? '1F' : '1E';
  return [`avc1.6400${level}`, `avc1.42E0${level}`];
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

  beginRecording(maxDurationMs = DEFAULT_DURATION_MS) {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || track.readyState !== 'live') throw new Error('Start the camera before recording.');
    if (this.recording) throw new Error('A recording is already in progress.');
    this.recording = true;
    const duration = clampDuration(maxDurationMs);
    let activeSession = null;
    let pendingStopReason = null;
    const stop = reason => {
      if (activeSession) activeSession.stop(reason);
      else pendingStopReason = reason;
    };
    const result = this.createRecordingSession(track, duration).then(session => {
      activeSession = session;
      if (pendingStopReason) session.stop(pendingStopReason);
      return session.result;
    }).finally(() => {
      this.recording = false;
    });
    return { stop, result };
  }

  async createRecordingSession(track, duration) {
    const cfrSession = await this.createCfrRecordingSession(duration);
    return cfrSession || this.createMediaRecorderSession(track, duration);
  }

  async createCfrRecordingSession(duration) {
    if (!globalThis.VideoEncoder || !globalThis.VideoFrame || !this.video.requestVideoFrameCallback) return null;
    const sourceWidth = this.video.videoWidth;
    const sourceHeight = this.video.videoHeight;
    const width = Math.max(Math.floor(sourceWidth / 2) * 2, Math.floor(sourceHeight / 2) * 2);
    const height = Math.min(Math.floor(sourceWidth / 2) * 2, Math.floor(sourceHeight / 2) * 2);
    if (!width || !height) return null;

    let encoderConfig = null;
    for (const codec of avcCodecCandidates(width, height)) {
      const candidate = {
        codec,
        width,
        height,
        bitrate: VIDEO_BITS_PER_SECOND,
        framerate: CFR_FRAME_RATE,
        hardwareAcceleration: 'prefer-hardware',
        latencyMode: 'realtime',
        avc: { format: 'avc' },
      };
      try {
        const support = await VideoEncoder.isConfigSupported(candidate);
        if (support.supported) {
          encoderConfig = support.config;
          break;
        }
      } catch {
        // Try the next AVC profile before falling back to MediaRecorder.
      }
    }
    if (!encoderConfig) return null;
    try {
      return this.createWebCodecsSession(encoderConfig, recordingFrameCount(duration), { sourceWidth, sourceHeight });
    } catch {
      return null;
    }
  }

  createWebCodecsSession(encoderConfig, frameCount, sourceSize) {
    const canvas = document.createElement('canvas');
    canvas.width = encoderConfig.width;
    canvas.height = encoderConfig.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return null;

    // Crop an upright portrait image, then pre-rotate it into the landscape
    // track. The MP4's +90 degree display matrix restores upright playback.
    const portraitWidth = encoderConfig.height;
    const portraitHeight = encoderConfig.width;
    const targetAspect = portraitWidth / portraitHeight;
    const sourceAspect = sourceSize.sourceWidth / sourceSize.sourceHeight;
    let cropX = 0, cropY = 0, cropWidth = sourceSize.sourceWidth, cropHeight = sourceSize.sourceHeight;
    if (sourceAspect > targetAspect) {
      cropWidth = sourceSize.sourceHeight * targetAspect;
      cropX = (sourceSize.sourceWidth - cropWidth) / 2;
    } else {
      cropHeight = sourceSize.sourceWidth / targetAspect;
      cropY = (sourceSize.sourceHeight - cropHeight) / 2;
    }

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: {
        codec: 'avc',
        width: encoderConfig.width,
        height: encoderConfig.height,
        rotation: 90,
        frameRate: CFR_FRAME_RATE,
      },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'strict',
    });
    let encoder = null;
    let frameHandle = null;
    let frameIndex = 0;
    let settled = false;
    let rejectCapture = null;
    let watchdog = null;

    const cancelFrame = () => {
      if (frameHandle !== null) this.video.cancelVideoFrameCallback?.(frameHandle);
      frameHandle = null;
    };
    const fail = error => {
      if (settled) return;
      settled = true;
      cancelFrame();
      clearTimeout(watchdog);
      rejectCapture?.(error instanceof Error ? error : new Error(String(error)));
    };
    const stop = reason => {
      if (settled) return;
      if (reason !== 'timeout') fail(new Error(`Recording stopped: ${reason}.`));
    };
    const result = new Promise((resolve, reject) => {
      rejectCapture = reject;
      encoder = new VideoEncoder({
        output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
        error: fail,
      });
      encoder.configure(encoderConfig);
      watchdog = setTimeout(() => fail(new Error('CFR recording did not receive enough camera frames.')), 2000);

      const encodeFrame = () => {
        if (settled) return;
        try {
          const timing = cfrFrameTiming(frameIndex);
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.translate(0, canvas.height);
          context.rotate(-Math.PI / 2);
          context.drawImage(
            this.video,
            cropX, cropY, cropWidth, cropHeight,
            0, 0, portraitWidth, portraitHeight,
          );
          context.setTransform(1, 0, 0, 1, 0, 0);
          const frame = new VideoFrame(canvas, timing);
          encoder.encode(frame, { keyFrame: frameIndex === 0 });
          frame.close();
          frameIndex++;
          if (frameIndex < frameCount) {
            frameHandle = this.video.requestVideoFrameCallback(encodeFrame);
            return;
          }
          cancelFrame();
          clearTimeout(watchdog);
          void encoder.flush().then(() => {
            if (settled) return;
            muxer.finalize();
            const mimeType = `video/mp4;codecs="${encoderConfig.codec.toLowerCase()}"`;
            const blob = new Blob([target.buffer], { type: mimeType });
            if (!blob.size) throw new Error('WebCodecs produced an empty recording.');
            settled = true;
            resolve({ blob, mimeType, stopReason: 'timeout', backend: 'webcodecs-cfr' });
          }).catch(fail);
        } catch (error) {
          fail(error);
        }
      };
      frameHandle = this.video.requestVideoFrameCallback(encodeFrame);
    }).then(async value => ({
      ...value,
      metadata: {
        ...await readVideoMetadata(value.blob),
        width: encoderConfig.width,
        height: encoderConfig.height,
      },
    })).finally(() => {
      cancelFrame();
      clearTimeout(watchdog);
      if (encoder?.state !== 'closed') encoder?.close();
    });
    return { stop, result };
  }

  createMediaRecorderSession(track, duration) {
    const mimeType = selectRecorderMime();
    if (!mimeType) throw new Error('This browser cannot create a supported video recording.');
    const recorder = new MediaRecorder(new MediaStream([track]), {
      mimeType,
      videoBitsPerSecond: VIDEO_BITS_PER_SECOND,
    });
    const chunks = [];
    let stopReason = 'timeout';
    let timer = null;
    const stop = reason => {
      stopReason = reason;
      if (recorder.state !== 'inactive') recorder.stop();
    };
    const result = new Promise((resolve, reject) => {
      recorder.addEventListener('dataavailable', event => {
        if (event.data?.size) chunks.push(event.data);
      });
      recorder.addEventListener('error', event => {
        clearTimeout(timer);
        reject(event.error || new Error('Recording failed.'));
      }, { once: true });
      recorder.addEventListener('stop', () => {
        clearTimeout(timer);
        const blob = new Blob(chunks, { type: mimeType });
        if (!blob.size) reject(new Error('The browser produced an empty recording.'));
        else resolve({ blob, mimeType, stopReason, backend: 'media-recorder' });
      }, { once: true });
      recorder.start();
      timer = setTimeout(() => stop('timeout'), duration);
    }).then(async value => ({ ...value, metadata: await readVideoMetadata(value.blob) }));
    return { stop, result };
  }

  stop() {
    for (const track of this.stream?.getTracks?.() || []) track.stop();
    this.stream = null;
    this.video.srcObject = null;
  }
}
