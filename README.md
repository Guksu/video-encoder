# 🎬 Video Encoder

**[한국어](README.ko.md)** | English

> A client-side video compressor that runs entirely in the browser — no server required.

Combines WebCodecs API (GPU-accelerated) with FFmpeg.wasm (CPU fallback) in a hybrid engine architecture. Your videos never leave your device.

---

## ✨ Features

- **Fully client-side** — video stays in the browser, no uploads, complete privacy
- **Hybrid engine** — WebCodecs (GPU) used first, automatic fallback to FFmpeg.wasm
- **H.264 High Profile** — B-frames + CABAC for efficient compression
- **CRF-based quality control** — slider to balance quality vs. file size
- **Resolution scaling** — Original / 1080p / 720p / 480p
- **Audio removal** — optionally strip the audio track
- **Real-time progress** — live progress bar with engine indicator
- **Result comparison** — before/after file size, reduction percentage, and instant download

---

## 🛠 Tech Stack

| Category | Technology |
|---|---|
| Build | Vite 8 + TypeScript 5 |
| Encoding (primary) | WebCodecs API — `VideoEncoder` / `VideoDecoder` |
| Encoding (fallback) | FFmpeg.wasm (`@ffmpeg/ffmpeg` + `@ffmpeg/core-mt`) |
| Demuxing | mp4box.js |
| Muxing | mp4-muxer |
| Styling | Vanilla CSS (no framework) |

---

## 🚀 Getting Started

### Requirements

- Node.js 18+
- Chrome 94+ / Edge 94+ recommended (for WebCodecs support)

### Install & Run

```bash
# Install dependencies
npm install

# Copy FFmpeg WASM files (first time only)
cp node_modules/@ffmpeg/core-mt/dist/esm/ffmpeg-core.js public/ffmpeg/
cp node_modules/@ffmpeg/core-mt/dist/esm/ffmpeg-core.wasm public/ffmpeg/
cp node_modules/@ffmpeg/core-mt/dist/esm/ffmpeg-core.worker.js public/ffmpeg/

# Start dev server
npm run dev
```

### Build

```bash
npm run build
npm run preview
```

> **Note**: FFmpeg.wasm multithreaded mode requires `SharedArrayBuffer`. The dev and preview servers set the necessary COOP/COEP headers automatically. When self-hosting, add these headers to your server:
>
> ```
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```

---

## ⚙️ Engine Selection

```
Does the browser support WebCodecs (H.264)?
    ├── YES → WebCodecs engine (GPU-accelerated)
    └── NO  → FFmpeg.wasm engine (CPU)

On WebCodecs failure → automatic fallback to FFmpeg.wasm
```

---

## 📁 Project Structure

```
src/
├── engine/
│   ├── index.ts            # Engine selection & compression entry point
│   ├── webcodecs-engine.ts # WebCodecs-based H.264 encoder
│   └── ffmpeg-engine.ts    # FFmpeg.wasm-based encoder
├── ui/
│   ├── dropzone.ts         # Drag-and-drop file input
│   ├── progress.ts         # Progress bar
│   └── result.ts           # Result card & download
├── utils/
│   ├── resolution.ts       # Resolution & bitrate calculation
│   └── format.ts           # File size formatting
├── main.ts                 # App state & event bindings
└── style.css               # Dark theme UI

public/
└── ffmpeg/                 # FFmpeg WASM local files
    ├── ffmpeg-core.js
    ├── ffmpeg-core.wasm
    └── ffmpeg-core.worker.js
```

---

## 🎛 Options

| Option | Description |
|---|---|
| **CRF** | 18 (best quality) to 40 (max compression). Lower = better quality, larger file |
| **Resolution** | Keep original or downscale to 1080p / 720p / 480p |
| **Remove Audio** | Strip the audio track entirely when toggled on |

---

## 📄 License

MIT
