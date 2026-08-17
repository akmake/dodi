/**
 * Media probing (reverse-engineering tool) — verbatim port of
 * `Whatsapp/server/services/statusProbe.js`. Measures exactly what WhatsApp
 * produces for statuses, so our encoder can match it.
 */
import ffmpeg from "fluent-ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import sharp from "sharp";
import fs from "fs";
import os from "os";
import path from "path";

ffmpeg.setFfprobePath(ffprobeInstaller.path);

export interface ImageProbe {
  kind: "image";
  format?: string;
  width?: number;
  height?: number;
  space?: string;
  chromaSubsampling?: string;
  isProgressive?: boolean;
  density?: number;
  bytes: number;
}

export interface VideoProbe {
  kind: "video";
  error?: string;
  container?: string;
  durationSec?: number;
  bytes: number;
  totalBitrate?: string;
  video?: {
    codec?: string;
    profile?: string;
    level?: string;
    width?: number;
    height?: number;
    pixFmt?: string;
    colorRange?: string;
    colorSpace?: string;
    colorTransfer?: string;
    colorPrimaries?: string;
    bitsPerRawSample?: string;
    hdr: boolean;
    fps?: string;
    bitrate?: string;
  };
  audio?: {
    codec?: string;
    profile?: string;
    sampleRate?: number;
    channels?: number;
    bitrate?: string;
  } | null;
}

// Image: sharp gives chroma subsampling + colour space — critical for matching.
export async function probeImage(buffer: Buffer): Promise<ImageProbe> {
  const m = await sharp(buffer).metadata();
  return {
    kind: "image",
    format: m.format,
    width: m.width,
    height: m.height,
    space: m.space,
    chromaSubsampling: m.chromaSubsampling,
    isProgressive: m.isProgressive,
    density: m.density,
    bytes: buffer.length,
  };
}

// Video: ffprobe gives codec/profile/pix_fmt/bitrate/fps/audio.
export function probeVideo(buffer: Buffer): Promise<VideoProbe> {
  const tmp = path.join(os.tmpdir(), `probe-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(tmp, buffer);
  return new Promise((resolve) => {
    ffmpeg.ffprobe(tmp, (err, data) => {
      try {
        fs.rmSync(tmp, { force: true });
      } catch {
        // ok
      }
      if (err) return resolve({ kind: "video", error: err.message, bytes: buffer.length });
      const v = (data.streams || []).find((s) => s.codec_type === "video") || ({} as (typeof data.streams)[number]);
      const a = (data.streams || []).find((s) => s.codec_type === "audio") || null;
      const f = data.format || {};
      resolve({
        kind: "video",
        container: f.format_name,
        durationSec: f.duration ? Number(f.duration) : undefined,
        bytes: buffer.length,
        totalBitrate: f.bit_rate ? Math.round(Number(f.bit_rate) / 1000) + "k" : undefined,
        video: {
          codec: v.codec_name,
          profile: v.profile as unknown as string,
          level: v.level,
          width: v.width,
          height: v.height,
          pixFmt: v.pix_fmt,
          colorRange: v.color_range,
          colorSpace: v.color_space,
          colorTransfer: v.color_transfer,
          colorPrimaries: v.color_primaries,
          bitsPerRawSample: v.bits_per_raw_sample as unknown as string,
          hdr: v.color_transfer === "smpte2084" || v.color_transfer === "arib-std-b67" || v.color_primaries === "bt2020",
          fps: v.avg_frame_rate,
          bitrate: v.bit_rate ? Math.round(Number(v.bit_rate) / 1000) + "k" : undefined,
        },
        audio: a?.codec_name
          ? {
              codec: a.codec_name,
              profile: a.profile as unknown as string,
              sampleRate: a.sample_rate,
              channels: a.channels,
              bitrate: a.bit_rate ? Math.round(Number(a.bit_rate) / 1000) + "k" : undefined,
            }
          : null,
      });
    });
  });
}

export async function probeMedia(buffer: Buffer, isVideo: boolean): Promise<ImageProbe | VideoProbe> {
  return isVideo ? await probeVideo(buffer) : await probeImage(buffer);
}
