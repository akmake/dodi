// Worker thread — runs the heavy Whisper (ONNX) transcription away from the
// main event loop, so one voice message doesn't block other message handling.
// Port of `Whatsapp/server/services/transcribeWorker.js`, verbatim.
//
// Kept as a plain .mjs file OUTSIDE `src/` on purpose: `worker_threads.Worker`
// loads a real file path at runtime, and Next.js's webpack/SWC build does not
// guarantee a stable, predictable output path for arbitrary TS modules under
// `.next/`. `src/modules/wtm/transcribe.ts` loads this file via
// `path.join(process.cwd(), "scripts/transcribeWorker.mjs")`, which is stable
// under `next start` (cwd = project root) regardless of the build.
import { parentPort } from "worker_threads";
import { pipeline } from "@xenova/transformers";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import fs from "fs";
import os from "os";
import path from "path";
import { randomBytes } from "crypto";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

let _transcriber = null;

const getTranscriber = async () => {
  if (!_transcriber) {
    _transcriber = await pipeline("automatic-speech-recognition", "Xenova/whisper-small", {
      quantized: true,
    });
  }
  return _transcriber;
};

const toWav = (inputPath) =>
  new Promise((resolve, reject) => {
    const outPath = path.join(os.tmpdir(), `wa_${randomBytes(6).toString("hex")}.wav`);
    ffmpeg(inputPath)
      .audioChannels(1)
      .audioFrequency(16000)
      .format("wav")
      .on("end", () => resolve(outPath))
      .on("error", reject)
      .save(outPath);
  });

const transcribe = async (filePath) => {
  let wavPath = null;
  try {
    wavPath = await toWav(filePath);
    const transcriber = await getTranscriber();
    const result = await transcriber(wavPath, {
      language: "hebrew",
      task: "transcribe",
      chunk_length_s: 30,
    });
    return result.text?.trim() || null;
  } finally {
    if (wavPath) {
      try {
        fs.unlinkSync(wavPath);
      } catch {
        // ok
      }
    }
  }
};

parentPort.on("message", async ({ id, filePath }) => {
  try {
    const text = await transcribe(filePath);
    parentPort.postMessage({ id, text });
  } catch (err) {
    parentPort.postMessage({ id, error: err.message });
  }
});
