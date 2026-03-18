export type Resolution = 'original' | '1080' | '720' | '480';

export function getTargetDimensions(
  originalWidth: number,
  originalHeight: number,
  resolution: Resolution
): { width: number; height: number } {
  if (resolution === 'original') {
    return { width: originalWidth, height: originalHeight };
  }

  const targetHeight = parseInt(resolution, 10);

  if (originalHeight <= targetHeight) {
    return { width: originalWidth, height: originalHeight };
  }

  // scale=-2:height 방식과 동일하게 비율 유지, width는 2의 배수로 맞춤
  const ratio = targetHeight / originalHeight;
  const targetWidth = Math.round((originalWidth * ratio) / 2) * 2;

  return { width: targetWidth, height: targetHeight };
}

/**
 * 해상도별 기본 비트레이트 반환 (WebCodecs용 기준값)
 * 실제 사용 시 CRF 값으로 추가 스케일링 필요
 */
export function calculateBitrate(
  targetHeight: number,
  originalBitrate?: number
): number {
  if (targetHeight >= 2160) return 25_000_000;  // 4K: 25 Mbps
  if (targetHeight >= 1080) return 10_000_000;  // 1080p: 10 Mbps
  if (targetHeight >= 720)  return 6_000_000;   // 720p: 6 Mbps
  if (targetHeight >= 480)  return 3_000_000;   // 480p: 3 Mbps
  // 원본 해상도 유지 시
  if (originalBitrate) {
    return Math.min(originalBitrate * 0.8, 30_000_000);
  }
  return 8_000_000;
}
