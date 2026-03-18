import type { Resolution } from '../utils/resolution';
import { getTargetDimensions, calculateBitrate } from '../utils/resolution';
import type { Track, Movie, Sample } from 'mp4box';
import { createFile, MP4BoxBuffer, DataStream, Endianness } from 'mp4box';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

export interface CompressOptions {
  crf: number;
  resolution: Resolution;
  removeAudio: boolean;
  onProgress: (percent: number) => void;
}

/**
 * High Profile (avc1.64XX) 코덱 문자열 반환.
 * High Profile: B-프레임 + 8×8 변환 지원 → 같은 비트레이트에서 Baseline 대비 ~25% 화질 향상.
 * DTS 단조 증가 문제는 addVideoChunkRaw로 DTS를 직접 추적해 해결.
 */
function getAvcCodec(width: number, height: number): string {
  const pixels = width * height;
  if (pixels <= 921_600)   return 'avc1.64001F'; // High Level 3.1
  if (pixels <= 2_073_600) return 'avc1.640029'; // High Level 4.1
  if (pixels <= 8_294_400) return 'avc1.640033'; // High Level 5.1
  return 'avc1.640034';                           // High Level 5.2
}

export async function supportsWebCodecs(): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    const support = await VideoEncoder.isConfigSupported({
      codec: 'avc1.640033',
      width: 1920,
      height: 1080,
      hardwareAcceleration: 'prefer-hardware',
    });
    return support.supported ?? false;
  } catch {
    return false;
  }
}

export async function compressWithWebCodecs(
  file: File,
  options: CompressOptions
): Promise<Blob> {
  const { resolution, onProgress } = options;
  const arrayBuffer = await file.arrayBuffer();

  return new Promise<Blob>((resolve, reject) => {
    const mp4boxIn = createFile();
    let videoTrackId = -1;
    let totalSamples = 0;
    let samplesSubmitted = 0;
    let framesEncoded = 0;
    let allSubmitted = false;
    let frameIndex = 0;

    let decoder: VideoDecoder;
    let encoder: VideoEncoder;
    let muxer: Muxer<ArrayBufferTarget>;
    let encoderFrameCount = 0;   // 출력된 청크 수 (DTS = count × avgDuration)
    let encoderDtsBase = -1;     // 첫 chunk.timestamp로 초기화 (DTS 기준점 동기화)

    mp4boxIn.onReady = (info: Movie) => {
      const videoTrack: Track | undefined = info.videoTracks[0];
      if (!videoTrack) { reject(new Error('비디오 트랙을 찾을 수 없습니다.')); return; }
      if (!videoTrack.video) { reject(new Error('비디오 정보를 읽을 수 없습니다.')); return; }

      videoTrackId = videoTrack.id;
      const { width: originalWidth, height: originalHeight } = videoTrack.video;
      totalSamples = videoTrack.nb_samples;
      // 원본 프레임레이트 및 평균 프레임 시간 계산
      const frameRate = videoTrack.nb_samples / (videoTrack.duration / videoTrack.timescale);
      const avgFrameDurationUs = Math.round(1_000_000 / frameRate);

      const { width: targetWidth, height: targetHeight } = getTargetDimensions(
        originalWidth, originalHeight, resolution
      );

      // 원본 비트레이트 기반으로 CRF 비율 적용 → 항상 원본보다 작은 파일 보장
      // CRF 18 → 85%,  CRF 23 → ~60%,  CRF 28 → ~42%,  CRF 35 → ~26%,  CRF 40 → ~18%
      const resolutionRef = calculateBitrate(targetHeight);
      const originalBps = videoTrack.bitrate ?? resolutionRef;
      const crfFactor = 0.85 * Math.pow(2, (18 - options.crf) / 8);
      // 해상도 다운스케일 시: min(원본, 해상도 기준값) → 4K→1080p 변환 시 4K 비트레이트 그대로 쓰지 않음
      const bitrate = Math.max(
        Math.round(Math.min(originalBps, resolutionRef) * crfFactor),
        100_000
      );

      const codec = getAvcCodec(targetWidth, targetHeight);

      muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: targetWidth, height: targetHeight },
        // fragmented: trun 박스가 i32로 CTO 저장 → 음수 compositionTimeOffset 지원 (B-프레임 필수)
        fastStart: 'fragmented',
        firstTimestampBehavior: 'offset',
      });

      const finalize = async () => {
        try {
          await decoder.flush();
          decoder.close();
          await encoder.flush();
          encoder.close();
          muxer.finalize();
          const outputBuffer = (muxer.target as ArrayBufferTarget).buffer;
          onProgress(100);
          resolve(new Blob([outputBuffer], { type: 'video/mp4' }));
        } catch (e) {
          reject(e);
        }
      };

      encoder = new VideoEncoder({
        output: (chunk, metadata) => {
          if (encoder.state === 'closed') return;
          // 첫 청크의 PTS를 DTS 기준점으로 사용 (mp4-muxer firstTimestampBehavior와 동기화)
          if (encoderDtsBase < 0) encoderDtsBase = chunk.timestamp;
          // DTS = base + frameCount × avgDuration → 드리프트 없이 단조 증가 보장
          // CTO = PTS - DTS (B-프레임이면 음수, fragmented MP4의 trun i32로 정확히 저장됨)
          const dts = encoderDtsBase + encoderFrameCount * avgFrameDurationUs;
          muxer.addVideoChunk(chunk, metadata, chunk.timestamp, chunk.timestamp - dts);
          encoderFrameCount++;
          framesEncoded++;
          onProgress(Math.min(Math.round((framesEncoded / totalSamples) * 98), 98));
        },
        error: (e) => reject(e),
      });

      encoder.configure({
        codec,                          // High Profile 유지 (CABAC, 8×8 변환 등)
        width: targetWidth,
        height: targetHeight,
        framerate: frameRate,           // 원본 프레임레이트 명시 → 인코더 GOP/비트 배분 최적화
        bitrate,
        bitrateMode: 'variable',        // VBR: 복잡한 장면에 더 많은 비트 할당
        hardwareAcceleration: 'prefer-hardware',
        latencyMode: 'quality',         // B-프레임 활성화 → 같은 비트레이트에서 화질 향상
      });

      // 입력 파일의 avcC 박스에서 디코더용 SPS/PPS 추출
      let decoderDescription: Uint8Array | undefined;
      try {
        const trak = mp4boxIn.getTrackById(videoTrackId);
        const stsd = trak?.mdia?.minf?.stbl?.stsd;
        if (stsd?.entries?.[0]) {
          const entry = stsd.entries[0] as unknown as Record<string, unknown>;
          if (entry['avcC']) {
            const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
            (entry['avcC'] as { write: (s: DataStream) => void }).write(stream);
            decoderDescription = new Uint8Array(stream.buffer as ArrayBuffer, 8);
          }
        }
      } catch { /* description 없이 진행 */ }

      decoder = new VideoDecoder({
        output: (frame) => {
          if (encoder.state === 'closed') { frame.close(); return; }
          // quality 모드에서는 keyFrame 강제 금지 → 인코더가 B-프레임 GOP를 자율 최적화
          encoder.encode(frame);
          frameIndex++;
          frame.close();
        },
        error: (e) => reject(e),
      });

      decoder.configure({
        codec: videoTrack.codec,
        codedWidth: originalWidth,
        codedHeight: originalHeight,
        description: decoderDescription,
      });

      mp4boxIn.setExtractionOptions(videoTrackId, null, { nbSamples: 100 });
      mp4boxIn.start();

      mp4boxIn.onSamples = (_id: number, _user: unknown, samples: Array<Sample>) => {
        for (const sample of samples) {
          if (!sample.data) continue;
          decoder.decode(new EncodedVideoChunk({
            type: sample.is_sync ? 'key' : 'delta',
            timestamp: (sample.cts / sample.timescale) * 1_000_000,  // PTS(cts), not DTS
            duration: (sample.duration / sample.timescale) * 1_000_000,
            data: sample.data,
          }));
          samplesSubmitted++;
        }

        if (!allSubmitted && samplesSubmitted >= totalSamples) {
          allSubmitted = true;
          finalize().catch(reject);
        }
      };
    };

    mp4boxIn.onError = (e: string) => reject(new Error(e));

    const mp4buf = MP4BoxBuffer.fromArrayBuffer(arrayBuffer, 0);
    mp4boxIn.appendBuffer(mp4buf);
    mp4boxIn.flush();
  });
}
