import { formatBytes, calcReductionPercent } from '../utils/format';

export function showResult(
  originalSize: number,
  compressedSize: number,
  blob: Blob,
  fileName: string,
  onReset: () => void
): void {
  const card = document.getElementById('result-card')!;
  const originalSizeEl = document.getElementById('result-original-size')!;
  const compressedSizeEl = document.getElementById('result-compressed-size')!;
  const ratioEl = document.getElementById('result-ratio')!;
  const btnDownload = document.getElementById('btn-download') as HTMLButtonElement;
  const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

  originalSizeEl.textContent = formatBytes(originalSize);
  compressedSizeEl.textContent = formatBytes(compressedSize);

  const reduction = calcReductionPercent(originalSize, compressedSize);
  ratioEl.textContent = `▼ ${reduction}% smaller`;

  // 기존 이벤트 교체를 위해 클론
  const newDownload = btnDownload.cloneNode(true) as HTMLButtonElement;
  btnDownload.parentNode!.replaceChild(newDownload, btnDownload);

  let objectUrl: string | null = null;

  newDownload.addEventListener('click', () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName.replace(/\.[^.]+$/, '_compressed.mp4');
    a.click();
    // 약간의 지연 후 revoke
    setTimeout(() => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    }, 10_000);
  });

  const newReset = btnReset.cloneNode(true) as HTMLButtonElement;
  btnReset.parentNode!.replaceChild(newReset, btnReset);
  newReset.addEventListener('click', () => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
    card.classList.add('hidden');
    onReset();
  });

  card.classList.remove('hidden');
}

export function hideResult(): void {
  document.getElementById('result-card')!.classList.add('hidden');
}
