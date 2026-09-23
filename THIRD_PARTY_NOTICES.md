# Third-Party Notices

## MediaPipe Tasks Vision

The project uses `@mediapipe/tasks-vision` and includes its browser WebAssembly runtime files under `public/wasm/`.

MediaPipe is provided by Google under the Apache License 2.0. Retain the upstream license and notice files when redistributing these artifacts.

## MP4 muxer

The project uses `mp4-muxer` 5.2.2 to package WebCodecs H.264 frames into MP4 files. It is distributed under the MIT License.

```text
MIT License

Copyright (c) 2023 Vanilagy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Face Landmarker model

`public/models/face_landmarker.task` is the official MediaPipe Face Landmarker float16 task model, revision 1, used for local face detection, landmark estimation, and blendshape output.

Official source:

```text
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
```

The bundled file was independently downloaded from that source and matched byte-for-byte by SHA-256. Review Google's current model terms before redistributing a fork if your organization requires a separate model-use assessment.

Current artifact SHA-256:

```text
64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff  face_landmarker.task
```

## Runtime checksums

```text
4a97e2520ba506c680ecd6ba6acfb146888afa0e2746d57f205352bc6ebb82eb  vision_wasm_internal.js
f00ec4731faa23b3e714d00e88d4d10e2df5c0a427d3a2b4ae6e3526fdd14ef7  vision_wasm_internal.wasm
927def7b465c51b86e4b3060f93646aca4e27121f4b8fc0483786e407ea9cf1f  vision_wasm_nosimd_internal.js
3821ea9b1f7fb8c549ef2a064ef5c85750bf375c545a49fd6eea0df44a95f1f4  vision_wasm_nosimd_internal.wasm
```

The Apache License 2.0 text is included in `third_party/MEDIAPIPE_LICENSE.txt`.
