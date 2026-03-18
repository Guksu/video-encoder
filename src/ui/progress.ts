import type { EngineType } from '../engine/index';

export function showProgress(engine: EngineType): void {
  const section = document.getElementById('progress-section')!;
  const engineLabel = document.getElementById('engine-label')!;

  section.classList.remove('hidden');
  engineLabel.textContent =
    engine === 'webcodecs' ? 'WebCodecs (GPU)' : 'FFmpeg.wasm';
  updateProgress(0);
}

export function updateProgress(percent: number): void {
  const bar = document.getElementById('progress-bar') as HTMLDivElement;
  const label = document.getElementById('progress-percent')!;
  bar.style.width = `${percent}%`;
  label.textContent = `${percent}%`;
}

export function hideProgress(): void {
  const section = document.getElementById('progress-section')!;
  section.classList.add('hidden');
}
