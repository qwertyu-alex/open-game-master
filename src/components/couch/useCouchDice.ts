"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { rollToDiceBoxNotation } from "@/lib/dice-notation";
import { diceLookTheme, type DiceLook } from "@/lib/dice/dice-look";
import { captureListeners, releaseListeners, type CapturedListener } from "@/lib/dice/dice-box-lifecycle";
import type { StoredRoll } from "@/lib/db/rolls";

// The TV's dice tray (docs/couch-mode-spec.md 2.10): the same dice-box-threejs
// tray as the table's DiceOverlay, but driven by the roll stage, which waits
// for the dice to come to rest before it shows the total. The physics is
// baked to land on the server's faces ("2d20@4,17"). One tray lives as long
// as the TV page: the TV is a dedicated screen, so its single WebGL context
// is never torn down between rolls.

type DiceBox = {
  initialize: () => Promise<void>;
  roll: (notation: string) => Promise<unknown>;
  clearDice: () => void;
  loadSounds: () => Promise<void>;
  sounds: boolean;
  volume: number;
  renderer?: {
    dispose: () => void;
    forceContextLoss: () => void;
    setPixelRatio: (ratio: number) => void;
    domElement: HTMLCanvasElement;
  };
};

type Tray = { box: DiceBox; listeners: CapturedListener[] };

export const COUCH_DICE_TRAY_ID = "couch-dice-tray";

// The room's dice, read from across the couch: the phone's green Roll die
// (couch.css --couch-accent) with near-black numbers on a plain face, so the
// die a player tapped is the one that lands. Not the signed-in account's own
// dice look: the default white paper with amber numbers washes out under a
// dark, warm scene at TV distance.
const COUCH_TV_DICE: DiceLook = {
  face: "#8FE0B5",
  numbers: "#03130B",
  outline: "",
  texture: "none",
  material: "plastic",
};

export type CouchDice = {
  // Throws the roll's own faces. False when the TV cannot (no WebGL,
  // reduced motion, a homebrew die): the card's flat die plays instead.
  throwDice: (roll: StoredRoll) => Promise<boolean>;
  clear: () => void;
};

export function useCouchDice(sound: { volume: number; on: boolean }): CouchDice {
  const trayRef = useRef<Tray | null>(null);
  const building = useRef<Promise<Tray | null> | null>(null);
  const failed = useRef(false);
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  });

  useEffect(() => () => {
    const tray = trayRef.current;
    trayRef.current = null;
    if (!tray) return;
    releaseListeners(window, tray.listeners);
    try {
      tray.box.clearDice();
      tray.box.renderer?.dispose();
      tray.box.renderer?.forceContextLoss();
      tray.box.renderer?.domElement.remove();
    } catch {
      // A half-built renderer is fine to abandon on the way out.
    }
  }, []);

  const ensure = useCallback(async (): Promise<Tray | null> => {
    if (trayRef.current || failed.current) return trayRef.current;
    building.current ??= (async () => {
      try {
        const { default: DiceBoxClass } = await import("@3d-dice/dice-box-threejs");
        const box = new DiceBoxClass(`#${COUCH_DICE_TRAY_ID}`, {
          assetPath: "/dice-box/",
          // Sounds load after the tray is up: the library waits on every
          // clip's canplaythrough, which a browser that does not preload
          // audio never sends, and the dice must not wait on the sound.
          sounds: false,
          shadows: true,
          light_intensity: 0.85,
          // Big enough to read a face from the couch (the table's own tray
          // is 85); several damage dice still fit the tray side by side.
          baseScale: 160,
          strength: 1.3,
          ...diceLookTheme(COUCH_TV_DICE),
        }) as unknown as DiceBox;
        const { result: ready, captured } = captureListeners(window, ["resize"], () => box.initialize());
        const tray: Tray = { box, listeners: captured };
        await ready;
        // The library sizes its canvas in CSS pixels and never sets a pixel
        // ratio, so a 2x screen stretched every die and its numbers soft.
        // Capped at 2: a 4K TV gains nothing it can show from across the
        // room for the extra pixels and shadow work.
        box.renderer?.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        trayRef.current = tray;
        // The collision sounds are switched on only once every clip is in:
        // the library reads its sound lists on each knock and throws on a
        // list it has not filled yet.
        void box.loadSounds().then(() => { box.sounds = true; }, () => {});
        return tray;
      } catch {
        failed.current = true;
        return null;
      } finally {
        building.current = null;
      }
    })();
    return building.current;
  }, []);

  const throwDice = useCallback(async (roll: StoredRoll): Promise<boolean> => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !roll.breakdown) return false;
    const notations = rollToDiceBoxNotation(roll.breakdown);
    if (!notations) return false;
    const tray = await ensure();
    if (!tray) return false;
    const { volume, on } = soundRef.current;
    tray.box.volume = on ? Math.round(Math.min(1, Math.max(0, volume)) * 100) : 0;
    try {
      for (const [index, notation] of notations.entries()) {
        if (index) await new Promise((resolve) => setTimeout(resolve, 500));
        await tray.box.roll(notation);
      }
      return true;
    } catch {
      // A wedged throw must never hold up the game: the card shows the faces.
      return false;
    }
  }, [ensure]);

  const clear = useCallback(() => {
    try {
      trayRef.current?.box.clearDice();
    } catch {
      // Nothing on the table to clear.
    }
  }, []);

  return useMemo(() => ({ throwDice, clear }), [throwDice, clear]);
}
