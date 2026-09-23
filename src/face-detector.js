import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

function assetPath(path) {
  return `${import.meta.env.BASE_URL}${path}`.replace(/\/+/g, '/');
}

export function assessFace(result) {
  const faces = result?.faceLandmarks || [];
  const categories = result?.faceBlendshapes?.[0]?.categories || [];
  const score = name => categories.find(item => item.categoryName === name)?.score ?? null;
  const actions = { blinkLeft: score('eyeBlinkLeft'), blinkRight: score('eyeBlinkRight'), jawOpen: score('jawOpen') };
  if (!faces.length) return { state: 'missing', label: 'No face', faceCount: 0, actions };
  if (faces.length > 1) return { state: 'adjust', label: 'One person only', faceCount: faces.length };
  const landmarks = faces[0];
  const left = landmarks[234], right = landmarks[454], nose = landmarks[1], top = landmarks[10], bottom = landmarks[152];
  if (![left, right, nose, top, bottom].every(Boolean)) return { state: 'adjust', label: 'Hold still', faceCount: 1, landmarks, actions };
  const width = Math.abs(right.x - left.x);
  const centerY = (top.y + bottom.y) / 2;
  const centered = Math.abs(nose.x - .5) < .1 && Math.abs(centerY - .55) < .13;
  if (width < .35) return { state: 'adjust', label: 'Move closer', faceCount: 1, landmarks, width, actions };
  if (width > .62) return { state: 'adjust', label: 'Move farther away', faceCount: 1, landmarks, width, actions };
  if (!centered) return { state: 'adjust', label: 'Center your face', faceCount: 1, landmarks, width, actions };
  return { state: 'ready', label: 'Face ready', faceCount: 1, landmarks, width, actions };
}

export function drawLandmarks(canvas, video, landmarks) {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, width, height);
  if (!landmarks) return;
  context.save();
  context.translate(width, 0);
  context.scale(-1, 1);
  context.fillStyle = 'rgba(75, 224, 163, .75)';
  for (let index = 0; index < landmarks.length; index += 12) {
    const point = landmarks[index];
    context.beginPath();
    context.arc(point.x * width, point.y * height, 1.5, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

export class LocalFaceDetector {
  constructor(video, canvas, onResult) {
    this.video = video;
    this.canvas = canvas;
    this.onResult = onResult;
    this.landmarker = null;
    this.running = false;
    this.frameHandle = null;
    this.lastVideoTime = -1;
    this.lastDetectionAt = -Infinity;
    this.minimumDetectionIntervalMs = 0;
  }

  async load() {
    if (this.landmarker) return;
    const files = await FilesetResolver.forVisionTasks(assetPath('wasm'));
    const options = {
      baseOptions: { modelAssetPath: assetPath('models/face_landmarker.task'), delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 2,
      outputFaceBlendshapes: true,
      minFaceDetectionConfidence: .5,
      minFacePresenceConfidence: .5,
      minTrackingConfidence: .5,
    };
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(files, options);
    } catch {
      this.landmarker = await FaceLandmarker.createFromOptions(files, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: 'CPU' },
      });
    }
  }

  start() {
    if (!this.landmarker || this.running) return;
    this.running = true;
    this.lastVideoTime = -1;
    this.lastDetectionAt = -Infinity;
    const detect = timestamp => {
      if (!this.running) return;
      if (this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
          && this.video.currentTime !== this.lastVideoTime
          && timestamp - this.lastDetectionAt >= this.minimumDetectionIntervalMs) {
        this.lastVideoTime = this.video.currentTime;
        this.lastDetectionAt = timestamp;
        const assessment = assessFace(this.landmarker.detectForVideo(this.video, performance.now()));
        drawLandmarks(this.canvas, this.video, assessment.landmarks);
        this.onResult?.(assessment);
      }
      this.frameHandle = this.running ? requestAnimationFrame(detect) : null;
    };
    detect(performance.now());
  }

  setMaximumFrameRate(frameRate) {
    this.minimumDetectionIntervalMs = Number.isFinite(frameRate) && frameRate > 0 ? 1000 / frameRate : 0;
  }

  stop() {
    this.running = false;
    if (this.frameHandle !== null) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = null;
    drawLandmarks(this.canvas, this.video, null);
  }

  close() {
    this.stop();
    this.landmarker?.close?.();
    this.landmarker = null;
  }
}
