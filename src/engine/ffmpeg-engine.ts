import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import type { Resolution } from '../utils/resolution';

export interface CompressOptions {
  crf: number;
  resolution: Resolution;
  removeAudio: boolean;
  onProgress: (percent: number) => void;
}

let ffmpegInstance: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;

  const ffmpeg = new FFmpeg();

  // public/ffmpeg/ 에 복사된 로컬 파일 로드 (CDN 의존 없음)
  await ffmpeg.load({
    coreURL: await toBlobURL('/ffmpeg/ffmpeg-core.js', 'text/javascript'),
    wasmURL: await toBlobURL('/ffmpeg/ffmpeg-core.wasm', 'application/wasm'),
    workerURL: await toBlobURL('/ffmpeg/ffmpeg-core.worker.js', 'text/javascript'),
  });

  ffmpegInstance = ffmpeg;
  return ffmpeg;
}

function resetFFmpeg() {
  ffmpegInstance = null;
}

export async function compressWithFFmpeg(
  file: File,
  options: CompressOptions
): Promise<Blob> {
  const { crf, resolution, removeAudio, onProgress } = options;

  const ffmpeg = await getFFmpeg();

  const logs: string[] = [];
  const logHandler = ({ message }: { message: string }) => logs.push(message);
  const progressHandler = ({ progress }: { progress: number }) => {
    onProgress(Math.min(Math.round(progress * 100), 99));
  };
  ffmpeg.on('log', logHandler);
  ffmpeg.on('progress', progressHandler);

  const inputName = 'input.mp4';
  const outputName = 'output.mp4';

  await ffmpeg.writeFile(inputName, await fetchFile(file));

  const args: string[] = [
    '-i', inputName,
    '-c:v', 'libx264',
    '-crf', String(crf),
    '-preset', 'medium',
    '-movflags', '+faststart',
  ];

  if (resolution !== 'original') {
    args.push('-vf', `scale=-2:${resolution}`);
  }

  if (removeAudio) {
    args.push('-an');
  } else {
    args.push('-c:a', 'aac', '-b:a', '128k');
  }

  args.push(outputName);

  const exitCode = await ffmpeg.exec(args);
  ffmpeg.off('log', logHandler);
  ffmpeg.off('progress', progressHandler);

  if (exitCode !== 0) {
    await ffmpeg.deleteFile(inputName).catch(() => {});
    resetFFmpeg(); // 깨진 인스턴스 폐기
    const lastLog = logs.slice(-5).join('\n');
    throw new Error(`FFmpeg 인코딩 실패 (종료 코드: ${exitCode}).\n${lastLog}`);
  }

  const data = await ffmpeg.readFile(outputName);

  if (data instanceof Uint8Array && data.byteLength < 100) {
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
    throw new Error('FFmpeg 출력 파일이 비어있습니다. 인코딩에 실패했습니다.');
  }

  // 메모리 정리
  await ffmpeg.deleteFile(inputName).catch(() => {});
  await ffmpeg.deleteFile(outputName).catch(() => {});

  onProgress(100);

  // SharedArrayBuffer 호환성을 위해 일반 ArrayBuffer로 복사
  let outputBuffer: ArrayBuffer;
  if (data instanceof Uint8Array) {
    outputBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  } else {
    outputBuffer = new TextEncoder().encode(data).buffer as ArrayBuffer;
  }
  return new Blob([outputBuffer], { type: 'video/mp4' });
}
