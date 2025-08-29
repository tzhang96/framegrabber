## FrameGrabber

Simple web app to upload a video, scrub to a time, preview the frame, and download it as a JPEG. Runs fully in the browser via ffmpeg.wasm.

### Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000 and:
- Upload a video file
- Move the slider to set the timestamp
- Click "Update preview" to generate the frame
- Click "Download frame" to save it

Notes:
- First use triggers loading of `ffmpeg.wasm` (~tens of MB) which can take a few seconds.
- Browser must be cross origin isolated. This app sets COOP/COEP headers via `next.config.ts`.

### Deploy to Vercel

1. Push the repo to GitHub.
2. Create a new Vercel project from the repo.
3. Build & Output: defaults are fine. No additional env vars are required.

After deploy, open your app URL and use it the same way as locally.
