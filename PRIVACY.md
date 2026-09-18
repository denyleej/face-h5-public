# Privacy

This reference processes camera frames in the browser tab.

- Camera access starts only after the user presses **Start camera**.
- Audio is never requested.
- Face landmarks are computed locally and are not persisted.
- Recordings remain in browser memory until replaced, downloaded, or the page closes.
- The application does not send camera frames, landmarks, recordings, or device metadata anywhere.
- The application does not use analytics or persistent browser storage.

The static hosting provider still receives ordinary asset requests needed to load the page, JavaScript, WebAssembly runtime, and model file. Review the hosting provider's request logging and retention settings before deployment.

Any downstream product that adds network submission, identity data, analytics, or persistent storage must provide its own consent, retention, deletion, and security controls.
