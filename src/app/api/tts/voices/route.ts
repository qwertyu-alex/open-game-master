import { currentUser, unauthorized } from "@/lib/auth";
import { labelVoices, listedDefaultVoice, serverVoices, ttsBackend } from "@/lib/tts-backend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The narrator voices this server's speech backend offers, for the voice
// pickers (issue 89). `listed` says the server named them itself; when it is
// false the list is the shipped fallback (or empty) and the picker leans on
// typing a voice. A custom voice string is always allowed: many servers take
// blends and described voices that no list could hold. ElevenLabs' voices
// come with what each sounds like and which part of the account it is from;
// with no default voice set there, the one it reads in is named, so a
// campaign's "server default" says whose voice that is.
export async function GET() {
  const user = await currentUser();
  if (!user) {
    return unauthorized();
  }
  const backend = ttsBackend();
  const listing = await serverVoices(backend);
  return Response.json({
    provider: backend.provider,
    voices: labelVoices(listing.ids, listing.details),
    listed: listing.listed,
    defaultVoice: backend.defaultVoice || (backend.provider === "elevenlabs" ? listedDefaultVoice(listing) : ""),
  });
}
