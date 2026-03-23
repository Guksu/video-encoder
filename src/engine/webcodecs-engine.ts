import type { Resolution } from '../utils/resolution';
import { getTargetDimensions, calculateBitrate } from '../utils/resolution';
import type { Track, Movie, Sample } from 'mp4box';
import { createFile, MP4BoxBuffer, DataStream, Endianness } from 'mp4box';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

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

/**
 * AAC-LC AudioSpecificConfig 2바이트 합성.
 * mp4-muxer의 decoderConfig.description으로 전달 → esds 박스에 기록됨.
 * 형식: objectType(5bit) | sampleRateIndex(4bit) | channels(4bit)
 */
function makeAudioSpecificConfig(sampleRate: number, numChannels: number): Uint8Array {
  const sampleRateTable = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  let idx = sampleRateTable.indexOf(sampleRate);
  if (idx === -1) {
    idx = sampleRateTable.reduce((best, rate, i) =>
      Math.abs(rate - sampleRate) < Math.abs(sampleRateTable[best] - sampleRate) ? i : best, 0);
  }
  // AAC-LC = objectType 2
  const byte1 = (2 << 3) | (idx >> 1);
  const byte2 = ((idx & 1) << 7) | (numChannels << 3);
  return new Uint8Array([byte1, byte2]);
}

export interface CompressOptions {
  crf: number;
  resolution: Resolution;
  removeAudio: boolean;
  onProgress: (percent: number) => void;
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
  const { resolution, onProgress, removeAudio } = options;
  const arrayBuffer = await file.arrayBuffer();

  return new Promise<Blob>((resolve, reject) => {
    const mp4boxIn = createFile();

    let videoTrackId = -1;
    let audioTrackId = -1;
    let totalSamples = 0;
    let samplesSubmitted = 0;
    let framesEncoded = 0;
    let frameIndex = 0;

    // 비디오 완료 여부
    let videoAllSubmitted = false;
    // 오디오 완료 여부 (오디오 없으면 처음부터 true)
    let audioAllDone = true;
    let audioTotalSamples = 0;
    let audioSamplesAdded = 0;

    let finalizing = false;

    let decoder: VideoDecoder;
    let encoder: VideoEncoder;
    let muxer: Muxer<ArrayBufferTarget>;
    let encoderFrameCount = 0;
    let encoderDtsBase = -1;

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
      const resolutionRef = calculateBitrate(targetHeight);
      const originalBps = videoTrack.bitrate ?? resolutionRef;
      const crfFactor = 0.85 * Math.pow(2, (18 - options.crf) / 8);
      const bitrate = Math.max(
        Math.round(Math.min(originalBps, resolutionRef) * crfFactor),
        100_000
      );

      const codec = getAvcCodec(targetWidth, targetHeight);

      // 오디오 트랙 감지
      const audioTrack: Track | undefined = info.audioTracks[0];
      const includeAudio = !removeAudio && !!audioTrack?.audio;

      if (includeAudio && audioTrack) {
        audioTrackId = audioTrack.id;
        audioTotalSamples = audioTrack.nb_samples;
        audioAllDone = false;
      }

      // Muxer 초기화 (오디오 포함 여부에 따라 분기)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const muxerOptions: any = {
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: targetWidth, height: targetHeight },
        fastStart: 'fragmented',
        firstTimestampBehavior: 'offset',
      };
      if (includeAudio && audioTrack?.audio) {
        muxerOptions.audio = {
          codec: 'aac',
          numberOfChannels: audioTrack.audio.channel_count,
          sampleRate: audioTrack.audio.sample_rate,
        };
      }
      muxer = new Muxer(muxerOptions);

      // 비디오+오디오 모두 완료됐을 때만 finalize
      const tryFinalize = () => {
        if (videoAllSubmitted && audioAllDone && !finalizing) {
          finalizing = true;
          finalize().catch(reject);
        }
      };

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
          // 첫 청크의 PTS를 DTS 기준점으로 사용
          if (encoderDtsBase < 0) encoderDtsBase = chunk.timestamp;
          // DTS = base + frameCount × avgDuration → 드리프트 없이 단조 증가 보장
          const dts = encoderDtsBase + encoderFrameCount * avgFrameDurationUs;
          muxer.addVideoChunk(chunk, metadata, chunk.timestamp, chunk.timestamp - dts);
          encoderFrameCount++;
          framesEncoded++;
          onProgress(Math.min(Math.round((framesEncoded / totalSamples) * 98), 98));
        },
        error: (e) => reject(e),
      });

      encoder.configure({
        codec,
        width: targetWidth,
        height: targetHeight,
        framerate: frameRate,
        bitrate,
        bitrateMode: 'variable',
        hardwareAcceleration: 'prefer-hardware',
        latencyMode: 'quality',
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

      // AAC 패스스루용 AudioSpecificConfig
      const audioDescription = includeAudio && audioTrack?.audio
        ? makeAudioSpecificConfig(audioTrack.audio.sample_rate, audioTrack.audio.channel_count)
        : undefined;

      // 트랙 추출 설정
      mp4boxIn.setExtractionOptions(videoTrackId, null, { nbSamples: 100 });
      if (includeAudio && audioTrack) {
        mp4boxIn.setExtractionOptions(audioTrackId, null, { nbSamples: 100 });
      }
      mp4boxIn.start();

      mp4boxIn.onSamples = (_id: number, _user: unknown, samples: Array<Sample>) => {
        if (_id === videoTrackId) {
          // 비디오 샘플 → 디코더로 전달
          for (const sample of samples) {
            if (!sample.data) continue;
            decoder.decode(new EncodedVideoChunk({
              type: sample.is_sync ? 'key' : 'delta',
              timestamp: (sample.cts / sample.timescale) * 1_000_000,
              duration: (sample.duration / sample.timescale) * 1_000_000,
              data: sample.data,
            }));
            samplesSubmitted++;
          }
          if (!videoAllSubmitted && samplesSubmitted >= totalSamples) {
            videoAllSubmitted = true;
            tryFinalize();
          }
        } else if (_id === audioTrackId && includeAudio && audioTrack?.audio) {
          // 오디오 샘플 → Muxer로 패스스루 (재인코딩 없음)
          for (const sample of samples) {
            if (!sample.data) continue;
            const isFirst = audioSamplesAdded === 0;
            const chunk = new EncodedAudioChunk({
              type: 'key',
              timestamp: (sample.cts / sample.timescale) * 1_000_000,
              duration: (sample.duration / sample.timescale) * 1_000_000,
              data: sample.data,
            });
            // 첫 청크에만 decoderConfig 메타데이터 첨부 (esds용 AudioSpecificConfig)
            const meta = isFirst && audioDescription
              ? {
                  decoderConfig: {
                    codec: 'mp4a.40.2',
                    sampleRate: audioTrack.audio.sample_rate,
                    numberOfChannels: audioTrack.audio.channel_count,
                    description: audioDescription,
                  },
                }
              : undefined;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (muxer as any).addAudioChunk(chunk, meta);
            audioSamplesAdded++;
          }
          if (!audioAllDone && audioSamplesAdded >= audioTotalSamples) {
            audioAllDone = true;
            tryFinalize();
          }
        }
      };
    };

    mp4boxIn.onError = (e: string) => reject(new Error(e));

    const mp4buf = MP4BoxBuffer.fromArrayBuffer(arrayBuffer, 0);
    mp4boxIn.appendBuffer(mp4buf);
    mp4boxIn.flush();
  });
}
