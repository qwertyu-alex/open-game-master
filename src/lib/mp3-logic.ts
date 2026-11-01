// How long an MP3 clip plays, read from its frame headers. Narration is cut
// into clips, one per voice change (src/lib/tts-segments.ts), and the TV
// shows whose face goes with the clip being heard (the narration cues), so
// each clip's length must be known on the server without decoding it. Every
// speech server here answers in MP3; constant or variable bitrate alike, the
// frames say how many samples each holds. Pure.

const BITRATES: Record<string, number[]> = {
  // MPEG-1, layers I, II, III; then MPEG-2 and 2.5, layer I, then II and III.
  "1-1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  "1-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "2-1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  "2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};

const SAMPLE_RATES: Record<number, number[]> = {
  1: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  25: [11025, 12000, 8000],
};

type Frame = { length: number; samples: number; sampleRate: number };

function frameAt(bytes: Uint8Array, at: number): Frame | null {
  if (at + 4 > bytes.length || bytes[at] !== 0xff || (bytes[at + 1] & 0xe0) !== 0xe0) {
    return null;
  }
  const versionBits = (bytes[at + 1] >> 3) & 0b11;
  const layerBits = (bytes[at + 1] >> 1) & 0b11;
  const bitrateIndex = bytes[at + 2] >> 4;
  const rateIndex = (bytes[at + 2] >> 2) & 0b11;
  const padding = (bytes[at + 2] >> 1) & 1;
  if (versionBits === 0b01 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15 || rateIndex === 3) {
    return null;
  }
  const version = versionBits === 0b11 ? 1 : versionBits === 0b10 ? 2 : 25;
  const layer = 4 - layerBits;
  const table = version === 1 ? `1-${layer}` : layer === 1 ? "2-1" : "2-2";
  const bitrate = BITRATES[table][bitrateIndex] * 1000;
  const sampleRate = SAMPLE_RATES[version][rateIndex];
  if (layer === 1) {
    return { length: (Math.floor((12 * bitrate) / sampleRate) + padding) * 4, samples: 384, sampleRate };
  }
  const samples = layer === 3 && version !== 1 ? 576 : 1152;
  return { length: Math.floor(((samples / 8) * bitrate) / sampleRate) + padding, samples, sampleRate };
}

// Seconds of audio in one clip; 0 when it holds no frame this can read.
export function mp3Seconds(bytes: Uint8Array): number {
  let at = 0;
  // An ID3v2 tag in front: its size is four 7-bit bytes, plus a footer when
  // the flag says so.
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size = ((bytes[6] & 0x7f) << 21) | ((bytes[7] & 0x7f) << 14) | ((bytes[8] & 0x7f) << 7) | (bytes[9] & 0x7f);
    at = 10 + size + (bytes[5] & 0x10 ? 10 : 0);
  }
  let seconds = 0;
  let first = true;
  while (at + 4 <= bytes.length) {
    const frame = frameAt(bytes, at);
    if (!frame || frame.length < 4) {
      // Not a frame here: look for the next sync word.
      at += 1;
      continue;
    }
    // A Xing or Info frame at the start describes the file and is silent
    // to a player.
    const head = first ? String.fromCharCode(...bytes.subarray(at + 4, Math.min(at + 40, bytes.length))) : "";
    if (!head.includes("Xing") && !head.includes("Info")) {
      seconds += frame.samples / frame.sampleRate;
    }
    first = false;
    at += frame.length;
  }
  return seconds;
}
