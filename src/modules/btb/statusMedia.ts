/**
 * Status media encoding — verbatim port of
 * `Whatsapp/server/services/statusMedia.js` (same ffmpeg filters/flags/CRF).
 */
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import fs from "fs";
import os from "os";
import path from "path";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

export const SEGMENT_SECONDS = 30;

// HDR arrives mostly as HEVC Main10 from modern phones. Main10 alone is not
// sufficient proof of HDR, so detection is based on the stream's colour tags.
// PQ (HDR10/Dolby Vision base layer), HLG and BT.2020 all require conversion
// before creating the 8-bit H.264 file used for a status.
const HDR_TRANSFERS = new Set(["smpte2084", "arib-std-b67"]);

function probeVideoStream(filePath: string): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return resolve({});
      resolve((data.streams || []).find((s) => s.codec_type === "video") || {});
    });
  });
}

function isHdrStream(stream: Record<string, unknown>): boolean {
  return HDR_TRANSFERS.has(stream.color_transfer as string) || stream.color_primaries === "bt2020";
}

const RESIZE_FILTER =
  "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2";
// For SDR, perform the range/matrix conversion in the pixels as well as tagging
// the output. Merely writing `-color_range tv` would mislabel full-range input.
const SDR_FILTER = `${RESIZE_FILTER},scale=in_range=auto:out_range=tv:out_color_matrix=bt709`;

// Work in linear light, map the HDR luminance into an SDR display range, then
// explicitly produce limited-range BT.709. Without this step a 10-bit HLG/PQ
// source is flattened into yuv420p and appears very bright/washed out.
const HDR_TO_SDR_FILTER = [
  RESIZE_FILTER,
  "zscale=transfer=linear:npl=100",
  "format=gbrpf32le",
  "zscale=primaries=bt709",
  "tonemap=tonemap=hable:desat=0",
  "zscale=transfer=bt709:matrix=bt709:range=limited",
  "format=yuv420p",
].join(",");

// Image: up to 1600 on the long edge (WhatsApp shrinks to ~1600 anyway — send
// high so its downscale wins, not ours), JPEG q95 4:4:4, sRGB, lanczos3.
export async function processImage(buffer: Buffer): Promise<Buffer> {
  return await sharp(buffer)
    .rotate() // per EXIF
    .resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true, kernel: "lanczos3" })
    .toColourspace("srgb")
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
}

export interface ProcessVideoOptions {
  firstSegmentOnly?: boolean;
  quality?: "max" | "optimized";
}

// Video: H.264 High / yuv420p / AAC, up to 1080×1920, forced keyframe every 30s
// + segment muxer => exact cuts into <=30s segments. Returns an array of
// Buffers (one segment or more). No ffprobe.
// opts.firstSegmentOnly — encodes only the first ~30s (quality test: fast, low memory).
export async function processVideo(buffer: Buffer, { firstSegmentOnly = false, quality = "max" }: ProcessVideoOptions = {}): Promise<Buffer[]> {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "btbvid-"));
  const inPath = path.join(work, "input");
  const outPattern = path.join(work, "seg_%03d.mp4");
  fs.writeFileSync(inPath, buffer);

  try {
    const sourceStream = await probeVideoStream(inPath);
    const hdr = isHdrStream(sourceStream);
    const optimized = quality === "optimized";
    await new Promise<void>((resolve, reject) => {
      const cmd = ffmpeg(inPath);
      if (firstSegmentOnly) cmd.inputOptions(["-t", String(SEGMENT_SECONDS)]); // read only the first 30s
      cmd
        .videoCodec("libx264")
        .audioCodec("aac")
        .audioBitrate(optimized ? "128k" : "192k")
        .outputOptions([
          "-profile:v",
          "high",
          "-pix_fmt",
          "yuv420p",
          // preset affects encoding speed and file size — not quality (set by crf).
          // medium = ~2-3x faster than slow, same quality, slightly bigger file (fine).
          "-preset",
          optimized ? "slow" : "medium",
          "-crf",
          optimized ? "19" : "16",
          // WhatsApp doesn't re-encode a status (E2E) — so the long edge goes up
          // to 1920 (not 1080): the only download is ours, and file size is
          // still far from the ceiling. Portrait stays 1080×1920.
          "-vf",
          hdr ? HDR_TO_SDR_FILTER : SDR_FILTER,
          // Declare the output explicitly. Players must not guess whether the
          // resulting 8-bit H.264 stream is HDR or full-range phone footage.
          "-color_primaries",
          "bt709",
          "-color_trc",
          "bt709",
          "-colorspace",
          "bt709",
          "-color_range",
          "tv",
          "-force_key_frames",
          `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
          "-f",
          "segment",
          "-segment_time",
          String(SEGMENT_SECONDS),
          "-reset_timestamps",
          "1",
        ])
        .on("end", () => resolve())
        .on("error", reject)
        .save(outPattern);
    });

    const files = fs.readdirSync(work).filter((f) => f.startsWith("seg_")).sort();
    return files.map((f) => fs.readFileSync(path.join(work, f)));
  } finally {
    try {
      fs.rmSync(work, { recursive: true, force: true });
    } catch {
      // ok
    }
  }
}
