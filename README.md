# Face Capture H5 Reference

A privacy-first browser reference for local face framing, action recognition, and camera recording. It includes a local MediaPipe Face Landmarker model, requests a portrait front-camera stream, recognizes a complete blink or mouth-open-and-close action, records the action, and lets the user preview or download it.

The project is deliberately standalone. It contains no service integration, business routing, user identity fields, session handling, analytics, or upload behavior.

## Features

- Front camera target: `480 x 640` at `30 fps`
- Local single-face, position, and distance feedback
- Blink and mouth-open-and-close challenges using local blendshape scores
- Recording starts with the challenge and stops shortly after the action completes
- Challenge timeout: `8 seconds`
- Native `MediaRecorder` output with MP4 preferred and WebM fallback
- Local preview and explicit download
- No audio capture
- No media upload or persistent browser storage
- GitHub Pages deployment workflow
- Automated public-source audit

Camera constraints are requests, not guarantees. Always read `MediaStreamTrack.getSettings()` and the recorded media metadata to learn the dimensions and frame rate selected by the device.

## Local development

Requirements: Node.js 20 or newer.

```sh
npm ci
npm run dev
```

The default command starts HTTP on `http://localhost:4180/`. Browsers treat `localhost` as a secure context, so camera testing works on the same development machine.

Available development modes:

```sh
npm run dev:http
npm run dev:https
npm run dev:all
```

Testing from another phone requires HTTPS. Plain HTTP on a LAN address is not a secure browser context and cannot obtain camera access.

### Local phone testing over HTTPS

Vite can read a local certificate without placing it in the repository. The certificate must cover the Mac's current LAN IP, and the issuing CA must be trusted on the phone.

```sh
FACE_CAPTURE_HTTPS_CERT_DIR=/absolute/path/to/cert-directory npm run dev:all
```

The directory must contain:

```text
server.key
server.crt
```

`dev:all` starts HTTP on port `4180` and HTTPS on port `4181`. Open the HTTP localhost URL on the development machine or the HTTPS network URL on the phone. The phone and development machine must be on the same network.

Ports can be changed without editing source:

```sh
FACE_CAPTURE_HTTP_PORT=8080 \
FACE_CAPTURE_HTTPS_PORT=8443 \
FACE_CAPTURE_HTTPS_CERT_DIR=/absolute/path/to/cert-directory \
npm run dev:all
```

Never commit the certificate directory, private key, or a machine-specific `.env` file.

## Verification

```sh
npm test
npm run build
```

`npm test` covers camera constraints, recorder format negotiation, face-state assessment, and a repository audit for private material and business-specific integration details.

## Deployment

The included workflow builds and publishes `dist/` to GitHub Pages. Enable Pages with **GitHub Actions** as the source in repository settings, then push the default branch.

The Vite base is relative, so the build works under a repository subpath.

## Project boundaries

This repository demonstrates capture mechanics only. Production identity verification requires a separately reviewed server-side design for consent, authorization, replay protection, retention, audit, and error handling.

See [PRIVACY.md](./PRIVACY.md), [SECURITY.md](./SECURITY.md), and [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md) before publishing or integrating the project.

## License

Project source is available under the MIT License. Bundled third-party runtime and model files have separate terms described in `THIRD_PARTY_NOTICES.md`.
