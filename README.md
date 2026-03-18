# 🎬 Video Encoder

> 서버 없이 브라우저에서 동작하는 클라이언트 사이드 비디오 압축기

WebCodecs API(GPU 가속)와 FFmpeg.wasm(CPU 폴백)을 결합한 하이브리드 엔진으로, 영상을 외부 서버에 업로드하지 않고 로컬에서 압축합니다.

---

## ✨ 주요 기능

- **완전한 클라이언트 사이드** — 영상이 브라우저 밖으로 나가지 않음, 개인정보 보호
- **하이브리드 엔진** — WebCodecs(GPU 가속) 우선 사용, 미지원 환경은 FFmpeg.wasm으로 자동 폴백
- **H.264 High Profile** — B-프레임 + CABAC 인코딩으로 높은 압축 효율
- **CRF 기반 품질 조절** — 슬라이더로 화질과 파일 크기의 균형 설정
- **해상도 선택** — Original / 1080p / 720p / 480p 다운스케일 지원
- **오디오 제거** — 영상에서 오디오 트랙 선택적 제거
- **실시간 진행률** — 압축 진행 상태 및 사용 엔진 표시
- **결과 비교** — 원본/압축 파일 크기 및 감소율 표시 후 즉시 다운로드

---

## 🛠 기술 스택

| 분류 | 기술 |
|---|---|
| 빌드 | Vite 8 + TypeScript 5 |
| 인코딩 (1순위) | WebCodecs API — `VideoEncoder` / `VideoDecoder` |
| 인코딩 (폴백) | FFmpeg.wasm (`@ffmpeg/ffmpeg` + `@ffmpeg/core-mt`) |
| 디먹싱 | mp4box.js |
| 먹싱 | mp4-muxer |
| 스타일 | Vanilla CSS (프레임워크 없음) |

---

## 🚀 시작하기

### 요구 사항

- Node.js 18+
- Chrome 94+ / Edge 94+ (WebCodecs 지원 브라우저 권장)

### 설치 및 실행

```bash
# 의존성 설치
npm install

# FFmpeg WASM 파일 복사 (최초 1회)
cp node_modules/@ffmpeg/core-mt/dist/esm/ffmpeg-core.js public/ffmpeg/
cp node_modules/@ffmpeg/core-mt/dist/esm/ffmpeg-core.wasm public/ffmpeg/
cp node_modules/@ffmpeg/core-mt/dist/esm/ffmpeg-core.worker.js public/ffmpeg/

# 개발 서버 시작
npm run dev
```

### 빌드

```bash
npm run build
npm run preview
```

> **주의**: FFmpeg.wasm 멀티스레드 모드는 `SharedArrayBuffer`가 필요합니다. 개발 서버와 프리뷰 서버는 COOP/COEP 헤더를 자동으로 설정합니다. 직접 배포 시 서버에서 아래 헤더를 반드시 추가하세요.
>
> ```
> Cross-Origin-Opener-Policy: same-origin
> Cross-Origin-Embedder-Policy: require-corp
> ```

---

## ⚙️ 엔진 선택 로직

```
브라우저가 WebCodecs(H.264) 지원?
    ├── YES → WebCodecs 엔진 (GPU 가속)
    └── NO  → FFmpeg.wasm 엔진 (CPU)

WebCodecs 실패 시 → FFmpeg.wasm 자동 폴백
```

---

## 📁 프로젝트 구조

```
src/
├── engine/
│   ├── index.ts            # 엔진 선택 및 압축 진입점
│   ├── webcodecs-engine.ts # WebCodecs 기반 H.264 인코더
│   └── ffmpeg-engine.ts    # FFmpeg.wasm 기반 인코더
├── ui/
│   ├── dropzone.ts         # 드래그 앤 드롭 파일 입력
│   ├── progress.ts         # 진행률 바
│   └── result.ts           # 결과 카드 및 다운로드
├── utils/
│   ├── resolution.ts       # 해상도/비트레이트 계산
│   └── format.ts           # 파일 크기 포맷
├── main.ts                 # 앱 상태 및 이벤트 바인딩
└── style.css               # 다크 테마 UI

public/
└── ffmpeg/                 # FFmpeg WASM 로컬 파일
    ├── ffmpeg-core.js
    ├── ffmpeg-core.wasm
    └── ffmpeg-core.worker.js
```

---

## 🎛 옵션 설명

| 옵션 | 설명 |
|---|---|
| **CRF** | 18(최고 화질) ~ 40(최대 압축). 낮을수록 화질 좋고 파일 큼 |
| **해상도** | 원본 유지 또는 1080p / 720p / 480p 다운스케일 |
| **오디오 제거** | 토글 시 오디오 트랙 완전 제거 |

---

## 📄 라이선스

MIT
