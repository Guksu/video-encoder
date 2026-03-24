import './style.css';
import { inject } from '@vercel/analytics';
import { initDropzone } from './ui/dropzone';
import { showProgress, updateProgress, hideProgress } from './ui/progress';
import { showResult, hideResult } from './ui/result';
import { compress } from './engine/index';
import type { EngineType } from './engine/index';
import { formatBytes } from './utils/format';
import type { Resolution } from './utils/resolution';
import { t, setLang, getLang } from './i18n';
import type { Lang } from './i18n';

interface AppState {
  file: File | null;
  crf: number;
  resolution: Resolution;
  removeAudio: boolean;
  status: 'idle' | 'loading-engine' | 'compressing' | 'done' | 'error';
  progress: number;
  originalSize: number;
  compressedSize: number;
  outputBlob: Blob | null;
  engineUsed: EngineType | null;
}

const state: AppState = {
  file: null,
  crf: 23,
  resolution: 'original',
  removeAudio: false,
  status: 'idle',
  progress: 0,
  originalSize: 0,
  compressedSize: 0,
  outputBlob: null,
  engineUsed: null,
};

// Elements
const dropzoneEl = document.getElementById('dropzone')!;
const fileInfoEl = document.getElementById('file-info')!;
const fileNameEl = document.getElementById('file-name')!;
const fileSizeEl = document.getElementById('file-size-original')!;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const optionsPanelEl = document.getElementById('options-panel')!;
const crfSlider = document.getElementById('crf-slider') as HTMLInputElement;
const crfValueEl = document.getElementById('crf-value')!;
const qualityLabelEl = document.getElementById('quality-label')!;
const resBtns = document.querySelectorAll<HTMLButtonElement>('.res-btn');
const removeAudioCheckbox = document.getElementById('remove-audio') as HTMLInputElement;
const btnCompress = document.getElementById('btn-compress') as HTMLButtonElement;
const errorMessageEl = document.getElementById('error-message')!;

// 파일 선택 핸들러
function onFileSelected(file: File): void {
  const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
  if (file.size > MAX_SIZE) {
    showError(t('err-too-large'));
    return;
  }

  state.file = file;
  state.status = 'idle';
  state.originalSize = file.size;

  fileNameEl.textContent = file.name;
  fileSizeEl.textContent = formatBytes(file.size);
  fileInfoEl.classList.remove('hidden');
  dropzoneEl.classList.add('hidden');
  optionsPanelEl.classList.remove('hidden');
  btnCompress.classList.remove('hidden');
  btnCompress.disabled = false;
  hideProgress();
  hideResult();
  hideError();
}

// 파일 제거
btnClear.addEventListener('click', resetApp);

function resetApp(): void {
  state.file = null;
  state.status = 'idle';
  state.outputBlob = null;

  fileInfoEl.classList.add('hidden');
  dropzoneEl.classList.remove('hidden');
  optionsPanelEl.classList.add('hidden');
  btnCompress.classList.add('hidden');
  hideProgress();
  hideResult();
  hideError();
}

function recompressApp(): void {
  state.status = 'idle';
  state.outputBlob = null;
  btnCompress.disabled = false;
  hideError();
}

// CRF 슬라이더
crfSlider.addEventListener('input', () => {
  state.crf = parseInt(crfSlider.value, 10);
  crfValueEl.textContent = String(state.crf);
  updateQualityLabel(state.crf);
  crfSlider.style.setProperty('--slider-percent', `${((state.crf - 18) / (40 - 18)) * 100}%`);
});

function getQualityLabel(crf: number): string {
  if (crf <= 22) return t('quality-high');
  if (crf <= 28) return t('quality-medium');
  return t('quality-low');
}

function updateQualityLabel(crf: number): void {
  qualityLabelEl.textContent = getQualityLabel(crf);
  qualityLabelEl.className = 'quality-badge ' + (crf <= 22 ? 'quality-high' : crf <= 28 ? 'quality-medium' : 'quality-low');
}

// 해상도 버튼
resBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    resBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.resolution = btn.dataset.res as Resolution;
  });
});

// 소리 제거 토글
removeAudioCheckbox.addEventListener('change', () => {
  state.removeAudio = removeAudioCheckbox.checked;
});

// 압축 시작
btnCompress.addEventListener('click', async () => {
  if (!state.file || state.status === 'compressing') return;

  state.status = 'compressing';
  btnCompress.disabled = true;
  hideError();

  // 실제 사용 엔진은 compress() 완료 후 result.engine으로 확인됨; 초기엔 webcodecs 표시
  const { supportsWebCodecs } = await import('./engine/webcodecs-engine');
  showProgress(await supportsWebCodecs() ? 'webcodecs' : 'ffmpeg');

  try {
    const result = await compress({
      file: state.file,
      crf: state.crf,
      resolution: state.resolution,
      removeAudio: state.removeAudio,
      onProgress: (percent) => {
        state.progress = percent;
        updateProgress(percent);
      },
    });

    state.outputBlob = result.blob;
    state.compressedSize = result.blob.size;
    state.engineUsed = result.engine;
    state.status = 'done';

    hideProgress();
    showResult(
      state.originalSize,
      state.compressedSize,
      result.blob,
      state.file.name,
      resetApp,
      recompressApp
    );
  } catch (err) {
    state.status = 'error';
    hideProgress();
    btnCompress.disabled = false;

    const msg = err instanceof Error ? err.message : 'An unknown error occurred.';

    if (msg.toLowerCase().includes('out of memory') || msg.toLowerCase().includes('oom')) {
      showError(t('err-oom'));
    } else {
      showError(t('err-compress') + msg);
    }
  }
});

function showError(msg: string): void {
  errorMessageEl.textContent = msg;
  errorMessageEl.classList.remove('hidden');
}

function hideError(): void {
  errorMessageEl.classList.add('hidden');
  errorMessageEl.textContent = '';
}

// Vercel Analytics
inject();

// 슬라이더 초기 상태
crfSlider.style.setProperty('--slider-percent', `${((state.crf - 18) / (40 - 18)) * 100}%`);

// 드롭존 초기화
initDropzone(onFileSelected);

// 언어 토글
const langBtns = document.querySelectorAll<HTMLButtonElement>('.lang-btn');
langBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const lang = btn.dataset.lang as Lang;
    if (lang === getLang()) return;
    setLang(lang);
    langBtns.forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
    // 동적으로 렌더된 텍스트 갱신
    updateQualityLabel(state.crf);
  });
});
