export type Lang = 'en' | 'ko';

// [en, ko]
const dict: Record<string, [string, string]> = {
  subtitle:             ['Client-side video compression — everything stays in your browser', '모든 압축이 내 브라우저 안에서 — 파일은 어디에도 업로드되지 않아요'],
  'dropzone-text':      ['Drag & drop a video file or click to select', '동영상 파일을 드래그하거나 클릭해서 선택하세요'],
  'dropzone-hint':      ['Supports MP4, MOV, AVI, MKV and more · Up to 2GB', 'MP4, MOV, AVI, MKV 등 지원 · 최대 2GB'],
  'label-quality':      ['Quality (CRF)', '화질 (CRF)'],
  'slider-high':        ['High quality', '고화질'],
  'slider-low':         ['Low quality', '저화질'],
  'quality-high':       ['High', '높음'],
  'quality-medium':     ['Medium', '보통'],
  'quality-low':        ['Low', '낮음'],
  'label-resolution':   ['Resolution', '해상도'],
  'res-original':       ['Original', '원본'],
  'label-remove-audio': ['Remove Audio', '오디오 제거'],
  'btn-compress':       ['Compress', '압축 시작'],
  'result-orig':        ['Original', '원본'],
  'result-compressed':  ['Compressed', '압축 후'],
  'btn-download':       ['Download', '다운로드'],
  'btn-reset':          ['Compress another file', '다른 파일 압축하기'],
  'result-ratio':       ['▼ {n}% smaller', '▼ {n}% 감소'],
  'err-too-large':      ['File size exceeds 2GB. Please select a smaller file.', '파일 크기가 2GB를 초과합니다. 더 작은 파일을 선택해 주세요.'],
  'err-oom':            ['Out of memory. The file may be too large.', '메모리가 부족합니다. 파일이 너무 클 수 있습니다.'],
  'err-compress':       ['Compression failed: ', '압축 실패: '],

  // Guide
  'guide-what-title':   ['What is this?', '이 앱은 무엇인가요?'],
  'guide-what-body':    [
    'Video Compressor is a <strong>100% client-side</strong> video compression tool. Your files never leave your browser — no uploads, no servers, no privacy concerns. It uses <strong>WebCodecs</strong> (GPU-accelerated, Chrome/Edge) or <strong>FFmpeg.wasm</strong> (universal fallback) depending on your browser.',
    'Video Compressor는 <strong>100% 클라이언트 사이드</strong> 동영상 압축 도구입니다. 파일이 브라우저 밖으로 나가지 않으며, 업로드·서버·개인정보 걱정이 없습니다. 브라우저에 따라 <strong>WebCodecs</strong>(GPU 가속, Chrome/Edge) 또는 <strong>FFmpeg.wasm</strong>(범용 폴백)을 사용합니다.',
  ],
  'guide-how-title':    ['How to use', '사용 방법'],
  'step1-title':        ['Select a video', '동영상 선택'],
  'step1-body':         ['Drag & drop a file onto the upload area, or click to pick one. Supports MP4, MOV, AVI, MKV and more (up to 2 GB).', '업로드 영역에 파일을 드래그하거나 클릭해서 선택하세요. MP4, MOV, AVI, MKV 등을 지원합니다 (최대 2GB).'],
  'step2-title':        ['Adjust options', '옵션 설정'],
  'step2-body':         ['Set the <em>Quality (CRF)</em> — lower value = better quality, larger file. Choose a target resolution, and optionally strip the audio track.', '<em>화질 (CRF)</em>을 설정하세요 — 낮을수록 높은 화질, 큰 파일 크기. 해상도를 선택하고 오디오 제거 여부를 설정하세요.'],
  'step3-title':        ['Compress', '압축'],
  'step3-body':         ['Click <em>Compress</em> and watch the real-time progress bar. The engine label shows whether GPU (WebCodecs) or software (FFmpeg) is being used.', '<em>압축 시작</em>을 클릭하고 실시간 진행률을 확인하세요. 엔진 표시를 통해 GPU(WebCodecs) 또는 소프트웨어(FFmpeg) 사용 여부를 알 수 있습니다.'],
  'step4-title':        ['Download', '다운로드'],
  'step4-body':         ['Once done, the before/after sizes are shown. Click <em>Download</em> to save the compressed file.', '완료 후 압축 전후 크기가 표시됩니다. <em>다운로드</em>를 클릭해 파일을 저장하세요.'],
  'guide-tips-title':   ['Tips', '팁'],
  'tip-1':              ['<strong>CRF 18–22</strong> — High quality, modest size reduction', '<strong>CRF 18–22</strong> — 높은 화질, 작은 압축률'],
  'tip-2':              ['<strong>CRF 23–28</strong> — Balanced quality and compression (recommended)', '<strong>CRF 23–28</strong> — 화질과 압축의 균형 (권장)'],
  'tip-3':              ['<strong>CRF 29–40</strong> — Maximum compression, noticeable quality loss', '<strong>CRF 29–40</strong> — 최대 압축, 화질 저하 발생'],
  'tip-4':              ['Dropping to <strong>720p</strong> often cuts file size in half with little visible difference on most screens.', '<strong>720p</strong>로 낮추면 대부분의 화면에서 체감 차이 없이 용량을 절반으로 줄일 수 있습니다.'],
  'tip-5':              ['Removing audio is great for silent clips — it can save 5–15% extra.', '무음 클립에서 오디오 제거 시 5–15% 추가 절약이 가능합니다.'],
};

let currentLang: Lang = 'en';

export function getLang(): Lang { return currentLang; }

export function t(key: string, vars?: Record<string, string | number>): string {
  const entry = dict[key];
  if (!entry) return key;
  let str = entry[currentLang === 'en' ? 0 : 1];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, String(v));
    }
  }
  return str;
}

export function setLang(lang: Lang): void {
  currentLang = lang;
  applyTranslations();
}

function applyTranslations(): void {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    const key = el.dataset.i18n!;
    const val = dict[key]?.[currentLang === 'en' ? 0 : 1];
    if (val !== undefined) el.textContent = val;
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-html]').forEach((el) => {
    const key = el.dataset.i18nHtml!;
    const val = dict[key]?.[currentLang === 'en' ? 0 : 1];
    if (val !== undefined) el.innerHTML = val;
  });
}
