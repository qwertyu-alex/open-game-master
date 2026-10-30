"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Prose } from "@/app/campaigns/[campaignId]/Prose";
import type { CampaignMessage } from "@/lib/db/messages";
import type { StoredRoll } from "@/lib/db/rolls";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import { storyBeats, type StoryEntry } from "@/components/couch/couch-logic";
import { passageParts } from "@/components/couch/phone-logic";
import { CouchRollChip } from "@/components/couch/CouchRules";

// The story on a phone (docs/couch-mode-spec.md 2.7), read like a chat:
// the newest GM passage sits just above the action box with what the
// players said since under it, and everything older folds under "Earlier".
// The phone scrolls the newest passage into view when it lands, so a player
// back from the kitchen looks down and reads on. Each roll stands where the
// GM rolled it. No message menus and no corrections: the TV is where the
// room reads the story, and the host fixes things from the host screen.
export function CouchStory({
  messages,
  sheets,
  rolls,
  meUserId,
  active,
}: {
  messages: CampaignMessage[];
  sheets: CharacterSheet[];
  rolls: StoredRoll[];
  meUserId: string;
  // Whether the Story view is the one showing: a passage that lands while
  // the Character view is up is brought into view on the way back.
  active: boolean;
}) {
  const beats = useMemo(() => storyBeats(messages), [messages]);
  const [earlierOpen, setEarlierOpen] = useState(false);
  const earlierId = useId();
  const latestRef = useRef<HTMLElement>(null);
  const latestId = beats.latest?.id ?? "";
  const scrolledTo = useRef("");
  useEffect(() => {
    const target = latestRef.current;
    if (!active || !latestId || !target || scrolledTo.current === latestId) return;
    // The first passage on arrival jumps; a new one while reading glides in.
    const first = scrolledTo.current === "";
    scrolledTo.current = latestId;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ block: "start", behavior: first || reduced ? "auto" : "smooth" });
  }, [latestId, active]);

  const nameOf = (entry: StoryEntry) => {
    const sheet =
      (entry.characterId ? sheets.find((candidate) => candidate.id === entry.characterId) : undefined) ??
      (entry.userId ? sheets.find((candidate) => candidate.userId === entry.userId && !candidate.isCompanion) : undefined);
    return sheet?.name ?? "Crew";
  };
  const rollsById = useMemo(() => new Map(rolls.map((roll) => [roll.id.toLowerCase(), roll])), [rolls]);
  const nameOfSheet = (characterId: string | null) =>
    characterId ? sheets.find((sheet) => sheet.id === characterId)?.name : undefined;
  const entry = (item: StoryEntry) =>
    item.kind === "gm" ? (
      <div key={item.id} className="couch-gm">
        <span className="couch-label">The GM</span>
        <Passage content={item.content} rollsById={rollsById} nameOfSheet={nameOfSheet} />
      </div>
    ) : (
      <Post key={item.id} name={nameOf(item)} mine={item.userId === meUserId} content={item.content} />
    );

  return (
    <section className="couch-story" aria-label="The story">
      {beats.earlier.length ? (
        <div>
          <button
            type="button"
            className="couch-earlier-toggle"
            aria-expanded={earlierOpen}
            aria-controls={earlierId}
            onClick={() => setEarlierOpen((open) => !open)}
          >
            {earlierOpen ? "Hide earlier" : "Earlier in the story"}
            <ChevronDown className="couch-chevron size-5" aria-hidden="true" />
          </button>
          {earlierOpen ? (
            <div id={earlierId} className="couch-earlier">
              {beats.earlier.map(entry)}
            </div>
          ) : null}
        </div>
      ) : null}
      {beats.latest ? (
        <article ref={latestRef} className="couch-gm couch-gm-latest" aria-label="The GM, latest">
          {beats.latest.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={beats.latest.imageUrl} alt="" className="couch-scene" data-insert={beats.latest.imageInsert ? "" : undefined} />
          ) : null}
          <span className="couch-label">The GM</span>
          <Passage content={beats.latest.content} rollsById={rollsById} nameOfSheet={nameOfSheet} />
        </article>
      ) : (
        <p className="couch-muted">The story starts on the TV. What the GM says will be here too.</p>
      )}
      {beats.after.map(entry)}
    </section>
  );
}

// What a player said or did, as a chat line: your own on the right.
function Post({ name, mine, content }: { name: string; mine: boolean; content: string }) {
  return (
    <div className="couch-post" data-mine={mine ? "" : undefined}>
      <span className="couch-post-who">{mine ? "You" : name}</span>
      <p className="couch-post-text">{content}</p>
    </div>
  );
}

function Passage({
  content,
  rollsById,
  nameOfSheet,
}: {
  content: string;
  rollsById: ReadonlyMap<string, StoredRoll>;
  nameOfSheet: (characterId: string | null) => string | undefined;
}) {
  const parts = useMemo(() => passageParts(content), [content]);
  return (
    <div className="couch-prose">
      {parts.map((part, index) => {
        if (part.kind === "text") {
          return part.paragraphs.map((paragraph, at) => (
            <p key={`${index}:${at}`}>
              <Prose text={paragraph} />
            </p>
          ));
        }
        const roll = rollsById.get(part.id);
        return roll ? <CouchRollChip key={part.id} roll={roll} who={nameOfSheet(roll.characterId)} /> : null;
      })}
    </div>
  );
}
