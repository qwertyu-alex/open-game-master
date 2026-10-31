"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { registerOutput, releaseOutput } from "@/lib/audio-devices";
import { AUDIO_PREF_FIELDS, hydrateAudioPrefs, writeAudioPref } from "@/lib/audio-prefs";
import { narrationAfterUnlock, type NarrationClip } from "@/lib/narration-queue-logic";

// Plays DM narration audio (tts_ready events). Only events that arrive
// AFTER mount autoplay; reconnect backlog never replays old narration.
// Narrations queue: a new one never interrupts the one playing, it waits
// its turn (manual replay is explicit intent and may interrupt). Mute and
// volume are per-user (localStorage), exposed through useSyncExternalStore
// so server render stays muted and the client snapshot takes over at
// hydration without a setState cascade. The account keeps a copy so another
// browser starts the same way; audio-prefs.ts owns that sync.
//
// Playback that fails is never dropped in silence (issue 88): a browser that
// refuses to autoplay hands the narration back to wait for the next gesture,
// and an audio file that will not load or decode is named in playbackFailure
// so the passage can say so.
//
// A table break (src/lib/dm/table-break.ts) holds narration on every screen:
// `onBreak` stops whatever is being read (it goes back to the front of the
// line, to be heard whole), nothing new starts, and what lands meanwhile
// queues. Resume plays the line in order, each passage from its finished
// file when that is ready, since a live stream may be gone by then. A replay
// pressed during the break is the listener's own choice and still plays.

// Long enough to sound deliberate rather than broken off.
const FLUSH_FADE_MS = 300;

const MUTED_KEY = AUDIO_PREF_FIELDS.narrationMuted.key;
const VOLUME_KEY = AUDIO_PREF_FIELDS.narrationVolume.key;
const PREFS_EVENT = AUDIO_PREF_FIELDS.narrationMuted.event;

function subscribePrefs(callback: () => void) {
  window.addEventListener(PREFS_EVENT, callback);
  return () => window.removeEventListener(PREFS_EVENT, callback);
}

function readMuted() {
  const stored = window.localStorage.getItem(MUTED_KEY);
  return stored === null ? false : stored === "1";
}

export function readVolume() {
  const stored = window.localStorage.getItem(VOLUME_KEY);
  if (stored === null) {
    return 0.8;
  }
  const value = Number(stored);
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.8;
}

export type NarrationAudio = {
  muted: boolean;
  volume: number;
  unlocked: boolean;
  playingMessageId: string | null;
  // How many narrations the browser is holding back until a gesture on this
  // page (pendingRef's length). The table says so above the composer and on
  // the header's narration icon, because a struck-through icon alone was
  // easy to miss for someone watching an AI party play without clicking.
  held: number;
  // The message whose audio this device last failed to play, if any.
  playbackFailure: string | null;
  // The passage being read is held mid-sentence by the listener (the couch
  // TV's Pause). It keeps its place: what lands meanwhile queues behind it.
  paused: boolean;
  pause: () => void;
  resume: () => void;
  // Where the clip being read has got to, in seconds, and how long it is
  // (Infinity while a live stream is still arriving). Null when nothing is
  // being read. Read on demand, so subtitles can follow the voice itself.
  clock: () => { messageId: string; seconds: number; duration: number } | null;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  unlock: () => void;
  play: (messageId: string, url: string) => void;
  // Replaying the passage being read starts it again from the top and keeps
  // what queued behind it.
  // Drops one clip nobody needs to hear any more, playing, waiting or not
  // yet arrived: a roll's call once the dice are thrown.
  skip: (messageId: string) => void;
  // Ends the reading for a table that has moved on: the clip being read
  // fades out and everything waiting behind it is dropped, except `keep`.
  flush: (keep?: string) => void;
  audioByMessage: Map<string, string>;
  onTtsReady: (messageId: string, url: string, live: boolean, keepWithNext?: boolean) => void;
};

export function useNarrationAudio(onBreak = false): NarrationAudio {
  const muted = useSyncExternalStore(subscribePrefs, readMuted, () => true);
  const volume = useSyncExternalStore(subscribePrefs, readVolume, () => 0.8);
  const [unlocked, setUnlocked] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [playbackFailure, setPlaybackFailure] = useState<string | null>(null);
  const [held, setHeld] = useState(0);
  // The clip paused by hand. Read as paused only while that clip is still
  // the one playing, so every other stop (skip, flush, mute, a break, the
  // next clip) ends the pause without having to clear it.
  const [pausedId, setPausedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioByMessage] = useState(() => new Map<string, string>());
  const unlockedRef = useRef(false);
  const playingRef = useRef<string | null>(null);
  const playingKeepWithNextRef = useRef(false);
  // Counts every start, so a playback can tell it was overtaken even by a
  // replay of the same passage.
  const turnRef = useRef(0);
  // Narrations wait for the current one instead of cutting it off.
  const queueRef = useRef<NarrationClip[]>([]);
  // Every messageId ever started or queued; guards against replays when the
  // same tts_ready re-enters through re-renders or reducer echoes.
  const handledRef = useRef(new Set<string>());
  // Narration that landed before the first user gesture. SessionView hands
  // each message over exactly once, so they wait here, oldest first, and
  // unlock() plays the newest passage with its answer readout, if any;
  // the rest keep their transcript replay.
  const pendingRef = useRef<NarrationClip[]>([]);
  // Every change to pendingRef goes through here so `held` follows it.
  const setPending = useCallback((next: NarrationClip[]) => {
    pendingRef.current = next;
    setHeld(next.length);
  }, []);
  // A table break is on: nothing starts by itself.
  const breakRef = useRef(onBreak);

  // The account copy of the prefs, applied over localStorage unless the
  // user touched a control first.
  useEffect(() => {
    hydrateAudioPrefs();
  }, []);

  // Unmount: the one element this hook owns stops and leaves the output
  // router, which otherwise keeps it for the life of the page.
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      // Leaving the table is this hook's own stop.
      turnRef.current += 1;
      if (audio) {
        audio.pause();
        audio.src = "";
        releaseOutput(audio);
        audioRef.current = null;
      }
    };
  }, []);

  // Stops the passage being read and drops what was waiting behind it.
  const silence = useCallback(() => {
    audioRef.current?.pause();
    queueRef.current = [];
    if (pendingRef.current.length) {
      setPending([]);
    }
    if (playingRef.current) {
      playingRef.current = null;
      setPlayingMessageId(null);
    }
  }, [setPending]);

  // The prefs reach what is already playing, whoever wrote them: the
  // header's own controls, the apps' Settings screen while the table stays
  // open, or the account's copy landing after the first passage started.
  useEffect(() => {
    const follow = () => {
      if (audioRef.current) {
        audioRef.current.volume = readVolume();
      }
      if (readMuted()) {
        silence();
      }
    };
    window.addEventListener(PREFS_EVENT, follow);
    return () => window.removeEventListener(PREFS_EVENT, follow);
  }, [silence]);

  // Applied here as well as through the event, for a browser that will not
  // store the pref (private browsing), where the event's re-read finds the
  // old value.
  const setMuted = useCallback((next: boolean) => {
    writeAudioPref("narrationMuted", next);
    if (next) {
      silence();
    }
  }, [silence]);

  const setVolume = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    writeAudioPref("narrationVolume", clamped);
    if (audioRef.current) {
      audioRef.current.volume = clamped;
    }
  }, []);

  const startPlayback = useCallback((messageId: string, url: string, keepWithNext = false) => {
    // Named plain function so playback can chain into the queued narration
    // when the current one ends.
    function run(id: string, src: string, keepWithNext = false) {
      if (!audioRef.current) {
        audioRef.current = registerOutput(new Audio());
      }
      const audio = audioRef.current;
      const finish = () => {
        if (playingRef.current !== id) {
          return;
        }
        playingRef.current = null;
        setPlayingMessageId(null);
        if (breakRef.current) {
          return;
        }
        const next = queueRef.current.shift();
        if (next && !readMuted()) {
          run(next.messageId, next.url, next.keepWithNext);
        }
      };
      const fail = () => {
        if (playingRef.current === id) {
          setPlaybackFailure(id);
        }
        finish();
      };
      audio.onended = finish;
      audio.onerror = fail;
      const turn = ++turnRef.current;
      // This hook stopped it or moved on: a newer passage or a replay, mute,
      // a break, leaving the table.
      const overtaken = () => playingRef.current !== id || turnRef.current !== turn;
      playingRef.current = id;
      playingKeepWithNextRef.current = keepWithNext;
      setPlayingMessageId(id);
      setPausedId(null);
      setPlaybackFailure((current) => (current === id ? null : current));
      audio.src = src;
      audio.volume = readVolume();
      let retried = false;
      const start = () => {
        audio.play().catch((error: unknown) => {
          if (overtaken()) {
            return;
          }
          if (error instanceof DOMException && error.name === "NotAllowedError") {
            // The browser wants a gesture first (a tab that was never
            // touched, or one that sat idle). This narration is offered only
            // once, so it goes back to wait, along with whatever queued
            // behind it, and the header shows the "enable audio" state
            // again. Oldest first, so the next unlock() plays the newest
            // passage and its readout and leaves the rest to replay, as at
            // first load.
            setPending([{ messageId: id, url: src, keepWithNext }, ...queueRef.current, ...pendingRef.current]);
            queueRef.current = [];
            playingRef.current = null;
            setPlayingMessageId(null);
            unlockedRef.current = false;
            setUnlocked(false);
            return;
          }
          // Every stop this hook makes is overtaken() above, so an
          // AbortError here came from elsewhere: a new load started under
          // this play() (issue 539: the apps hand the element a protected
          // file once it is fetched, a beat after src was set). The passage
          // is still wanted, so it is tried once more when the element can
          // play; a second failure is reported, never dropped in silence.
          if (error instanceof DOMException && error.name === "AbortError" && !retried) {
            retried = true;
            if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
              start();
              return;
            }
            audio.addEventListener(
              "canplay",
              () => {
                if (!overtaken()) {
                  start();
                }
              },
              { once: true },
            );
            return;
          }
          fail();
        });
      };
      start();
    }
    run(messageId, url, keepWithNext);
  }, [setPending]);

  // Explicit replay: interrupts whatever is playing and clears the queue.
  const play = useCallback(
    (messageId: string, url: string) => {
      const audio = audioRef.current;
      if (audio && playingRef.current === messageId) {
        setPausedId(null);
        audio.currentTime = 0;
        void audio.play().catch(() => setPlaybackFailure(messageId));
        return;
      }
      queueRef.current = [];
      startPlayback(messageId, url);
    },
    [startPlayback],
  );

  // Holds the clip where it is; its end, and so the queue, waits with it.
  const pause = useCallback(() => {
    const current = playingRef.current;
    if (!current || !audioRef.current) {
      return;
    }
    audioRef.current.pause();
    setPausedId(current);
  }, []);

  const resume = useCallback(() => {
    const current = playingRef.current;
    const audio = audioRef.current;
    setPausedId(null);
    if (!current || !audio) {
      return;
    }
    void audio.play().catch(() => setPlaybackFailure(current));
  }, []);

  const paused = pausedId !== null && pausedId === playingMessageId;

  const clock = useCallback(() => {
    const current = playingRef.current;
    const audio = audioRef.current;
    if (!current || !audio) {
      return null;
    }
    return { messageId: current, seconds: audio.currentTime, duration: audio.duration };
  }, []);

  // Skipping the clip being read starts the next in line, as its end would.
  // Marked handled first, so a call still being synthesized never starts.
  const skip = useCallback(
    (messageId: string) => {
      handledRef.current.add(messageId);
      queueRef.current = queueRef.current.filter((clip) => clip.messageId !== messageId);
      if (pendingRef.current.some((clip) => clip.messageId === messageId)) {
        setPending(pendingRef.current.filter((clip) => clip.messageId !== messageId));
      }
      if (playingRef.current !== messageId) {
        return;
      }
      const audio = audioRef.current;
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
      }
      playingRef.current = null;
      setPlayingMessageId(null);
      if (breakRef.current) {
        return;
      }
      const next = queueRef.current.shift();
      if (next && !readMuted()) {
        startPlayback(next.messageId, next.url, next.keepWithNext);
      }
    },
    [setPending, startPlayback],
  );

  // Timers rather than animation frames: the TV's tab may be in the
  // background, and a fade that never runs would leave the passage playing.
  // The element is shared, so a clip that starts during the fade takes it
  // over (its own start sets the volume) and the fade stops touching it.
  const flush = useCallback(
    (keep?: string) => {
      queueRef.current = queueRef.current.filter((clip) => clip.messageId === keep);
      if (pendingRef.current.some((clip) => clip.messageId !== keep)) {
        setPending(pendingRef.current.filter((clip) => clip.messageId === keep));
      }
      const current = playingRef.current;
      const audio = audioRef.current;
      if (!current || current === keep || !audio) {
        return;
      }
      audio.onended = null;
      audio.onerror = null;
      playingRef.current = null;
      setPlayingMessageId(null);
      const turn = turnRef.current;
      const from = audio.volume;
      const started = Date.now();
      const step = () => {
        if (turnRef.current !== turn) {
          return;
        }
        const done = Math.min(1, (Date.now() - started) / FLUSH_FADE_MS);
        audio.volume = from * (1 - done);
        if (done < 1) {
          window.setTimeout(step, 30);
          return;
        }
        audio.pause();
        audio.volume = readVolume();
        const next = queueRef.current.shift();
        if (next && !breakRef.current && !readMuted()) {
          startPlayback(next.messageId, next.url, next.keepWithNext);
        }
      };
      step();
    },
    [setPending, startPlayback],
  );

  // The browser requires a user gesture before audio can play; the header
  // speaker toggle doubles as that gesture.
  const unlock = useCallback(() => {
    setUnlocked(true);
    unlockedRef.current = true;
    // Only the newest passage (with its answer readout, if any) plays, on the
    // same "never interrupt what is playing" rule as live narration. A tab
    // watched for an hour can hold ten minutes of narration, and playing it
    // all back to back would bury the live scene under stale passages (the
    // server skips narration that fell behind on the same rule). The older
    // ones keep their replay buttons in the transcript (audioByMessage).
    const waiting = pendingRef.current;
    if (waiting.length) {
      setPending([]);
    }
    const [newest, ...following] = narrationAfterUnlock(waiting);
    if (!newest || readMuted()) {
      return;
    }
    if (playingRef.current || breakRef.current) {
      queueRef.current.push(newest, ...following);
      return;
    }
    queueRef.current.push(...following);
    startPlayback(newest.messageId, newest.url, newest.keepWithNext);
  }, [setPending, startPlayback]);

  // The break begins: the passage being read stops and waits at the front
  // of the line. It ends: the line plays, oldest first.
  useEffect(() => {
    breakRef.current = onBreak;
    if (onBreak) {
      const current = playingRef.current;
      if (!current) {
        return;
      }
      const audio = audioRef.current;
      playingRef.current = null;
      setPlayingMessageId(null);
      if (audio) {
        audio.onended = null;
        audio.onerror = null;
        audio.pause();
      }
      queueRef.current.unshift({ messageId: current, url: audioByMessage.get(current) ?? audio?.src ?? "", keepWithNext: playingKeepWithNextRef.current });
      return;
    }
    if (playingRef.current || !unlockedRef.current || readMuted()) {
      return;
    }
    const next = queueRef.current.shift();
    if (next) {
      startPlayback(next.messageId, audioByMessage.get(next.messageId) ?? next.url, next.keepWithNext);
    }
  }, [onBreak, audioByMessage, startPlayback]);

  // Any first interaction with the page (click, key press) also counts as
  // the unlock gesture, so narration autoplays without hunting for the
  // speaker button. On the click, not the press: unlocking takes the
  // "narration is waiting" banner off the composer, and the table's column,
  // anchored to its foot, moves everything above it while the button is still
  // held, so the release landed beside the button pressed and the first
  // press on End turn or a test fight's Back did nothing (issue 553). A click
  // still carries the gesture the browser asks for.
  useEffect(() => {
    if (unlocked) {
      return;
    }
    const handle = () => unlock();
    window.addEventListener("click", handle, { once: true });
    window.addEventListener("keydown", handle, { once: true });
    return () => {
      window.removeEventListener("click", handle);
      window.removeEventListener("keydown", handle);
    };
  }, [unlocked, unlock]);

  const onTtsReady = useCallback(
    (messageId: string, url: string, live: boolean, keepWithNext = false) => {
      audioByMessage.set(messageId, url);
      if (!live || readMuted() || handledRef.current.has(messageId)) {
        return;
      }
      handledRef.current.add(messageId);
      // The browser refuses to play before a user gesture, so hold rather
      // than drop: this narration is never offered a second time.
      if (!unlockedRef.current) {
        setPending([...pendingRef.current, { messageId, url, keepWithNext }]);
        return;
      }
      if (playingRef.current || breakRef.current) {
        queueRef.current.push({ messageId, url, keepWithNext });
      } else {
        startPlayback(messageId, url, keepWithNext);
      }
    },
    [audioByMessage, setPending, startPlayback],
  );

  // One object per real change, so the memoized header and the chat column
  // are not handed a new narration prop on every table render.
  return useMemo(
    () => ({
      muted,
      volume,
      unlocked,
      playingMessageId,
      held,
      playbackFailure,
      paused,
      pause,
      resume,
      clock,
      setMuted,
      setVolume,
      unlock,
      play,
      skip,
      flush,
      audioByMessage,
      onTtsReady,
    }),
    [muted, volume, unlocked, playingMessageId, held, playbackFailure, paused, pause, resume, clock, setMuted, setVolume, unlock, play, skip, flush, audioByMessage, onTtsReady],
  );
}
