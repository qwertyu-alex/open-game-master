// A clip as bare MPEG audio frames. A passage is its clips concatenated
// (src/lib/tts.ts), and ElevenLabs sends each clip with an ID3 tag and a
// LAME "Info" frame that counts that clip's own frames. Concatenated, the
// first clip's count is the whole passage's length to a player that trusts
// it (CoreAudio, so Safari, reported 8 s of a 10 s passage), and each later
// tag is junk mid-stream that ffmpeg, so Chrome, stumbles over ("Header
// missing"). Without them the passage is one constant-bitrate stream whose
// length every player reads from its size. Pure, for
// scripts/test-tts-backend.mjs.

// Layer III bitrates in kbps, by MPEG version: MPEG 1, then MPEG 2 and 2.5.
const BITRATES_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

function id3Length(audio: Buffer): number {
  if (audio.length < 10 || audio.toString("latin1", 0, 3) !== "ID3") {
    return 0;
  }
  // A synchsafe size: seven bits a byte, then the header, and the footer
  // when the flags say there is one.
  const size = ((audio[6] & 0x7f) << 21) | ((audio[7] & 0x7f) << 14) | ((audio[8] & 0x7f) << 7) | (audio[9] & 0x7f);
  return size + 10 + (audio[5] & 0x10 ? 10 : 0);
}

// The length of the Layer III frame at `at` when it is a Xing or Info
// header, else 0.
function infoFrameLength(audio: Buffer, at: number): number {
  if (at + 4 > audio.length || audio[at] !== 0xff || (audio[at + 1] & 0xe0) !== 0xe0) {
    return 0;
  }
  const version = (audio[at + 1] >> 3) & 3;
  const layer = (audio[at + 1] >> 1) & 3;
  const bitrate = (version === 3 ? BITRATES_V1 : BITRATES_V2)[audio[at + 2] >> 4] ?? 0;
  const sampleRate = SAMPLE_RATES[version]?.[(audio[at + 2] >> 2) & 3] ?? 0;
  if (layer !== 1 || version === 1 || !bitrate || !sampleRate) {
    return 0;
  }
  const mono = audio[at + 3] >> 6 === 3;
  const sideInfo = version === 3 ? (mono ? 17 : 32) : mono ? 9 : 17;
  const tag = audio.toString("latin1", at + 4 + sideInfo, at + 8 + sideInfo);
  if (tag !== "Xing" && tag !== "Info") {
    return 0;
  }
  const padding = (audio[at + 2] >> 1) & 1;
  return Math.floor(((version === 3 ? 144 : 72) * bitrate * 1000) / sampleRate) + padding;
}

export function bareMp3Frames(audio: Buffer): Buffer {
  const start = id3Length(audio);
  const info = infoFrameLength(audio, start);
  let end = audio.length;
  if (end - (start + info) >= 128 && audio.toString("latin1", end - 128, end - 125) === "TAG") {
    end -= 128;
  }
  const frames = audio.subarray(start + info, end);
  // Anything that does not start on a frame is left as it came.
  return frames.length && frames[0] === 0xff && (frames[1] & 0xe0) === 0xe0 ? frames : audio;
}
