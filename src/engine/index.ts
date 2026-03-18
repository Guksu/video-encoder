import { supportsWebCodecs, compressWithWebCodecs } from './webcodecs-engine';
import { compressWithFFmpeg } from './ffmpeg-engine';
import type { Resolution } from '../utils/resolution';

export type EngineType = 'webcodecs' | 'ffmpeg';

export interface CompressRequest {
  file: File;
  crf: number;
  resolution: Resolution;
  removeAudio: boolean;
  onProgress: (percent: number) => void;
}

export interface CompressResult {
  blob: Blob;
  engine: EngineType;
}

export async function compress(request: CompressRequest): Promise<CompressResult> {
  const { file, crf, resolution, removeAudio, onProgress } = request;

  const webCodecsAvailable = await supportsWebCodecs();
  console.log('[Engine] WebCodecs 지원:', webCodecsAvailable);

  if (webCodecsAvailable) {
    try {
      console.log('[Engine] WebCodecs 엔진 시작');
      const blob = await compressWithWebCodecs(file, { crf, resolution, removeAudio, onProgress });
      console.log('[Engine] WebCodecs 완료, 크기:', blob.size);
      return { blob, engine: 'webcodecs' };
    } catch (err) {
      console.warn('[Engine] WebCodecs 실패, FFmpeg.wasm으로 재시도:', err);
      onProgress(0);
    }
  }

  console.log('[Engine] FFmpeg.wasm 엔진 시작');
  const blob = await compressWithFFmpeg(file, { crf, resolution, removeAudio, onProgress });
  console.log('[Engine] FFmpeg 완료, 크기:', blob.size);
  return { blob, engine: 'ffmpeg' };
}
