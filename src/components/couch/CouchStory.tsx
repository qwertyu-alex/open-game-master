"use client";

import { ChevronDown, MapPin } from "lucide-react";
import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Prose } from "@/app/campaigns/[campaignId]/Prose";
import type { CampaignMessage } from "@/lib/db/messages";
import type { StoredRoll } from "@/lib/db/rolls";
import type { DmWhisper } from "@/lib/db/dm-whispers";
import type { CharacterSheet } from "@/lib/schemas/sheet";
import type { CouchSceneTag } from "@/lib/couch/whereabouts-logic";
import { storyBeats, type StoryEntry } from "@/components/couch/couch-logic";
import { passageParts, privateExchanges, type PrivateExchange } from "@/components/couch/phone-logic";
import { CouchRollChip } from "@/components/couch/CouchRules";
import { CouchExchange } from "@/components/couch/CouchWhispers";

// The story on a phone (docs/couch-mode-spec.md 2.7), read like a chat:
// the newest GM passage sits just above the action box with what this
// player said since under it (the others' moves stay hidden until the round
// closes), and everything older folds under "Earlier".
// The phone scrolls the newest passage into view when it lands, so a player
// back from the kitchen looks down and reads on. Each roll stands where the
// GM rolled it. What only this player asked and was told stands where it was
// asked, folded once the story moves past it. No message menus and no corrections: the TV is where the
// room reads the story, and the host fixes things from the host screen.
export function CouchStory({
  messages,
  sheets,
  rolls,
  meUserId,
  active,
  whispers,
  onAsk,
  watchRef,
  sceneTags = [],
  mySheetId = "",
}: {
  messages: CampaignMessage[];
  sheets: CharacterSheet[];
  rolls: StoredRoll[];
  meUserId: string;
  // Whether the Story view is the one showing: a passage that lands while
  // the Character view is up is brought into view on the way back.
  active: boolean;
  whispers: DmWhisper[];
  onAsk: () => void;
  // Watches an unread exchange (useWhisperWatch).
  watchRef: (exchangeId: string) => (element: HTMLElement | null) => void;
  // Which group each message of a split crew belongs to
  // (src/lib/couch/whereabouts.ts), and this player's character.
  sceneTags?: readonly CouchSceneTag[];
  mySheetId?: string;
}) {
  const tags = useMemo(() => new Map(sceneTags.map((tag) => [tag.messageId, tag])), [sceneTags]);
  const offSceneIds = useMemo(() => new Set(sceneTags.filter((tag) => !tag.inScene).map((tag) => tag.messageId)), [sceneTags]);
  const beats = useMemo(() => storyBeats(messages, undefined, meUserId, offSceneIds), [messages, meUserId, offSceneIds]);
  const exchanges = useMemo(() => {
    const story = [...beats.earlier, ...(beats.latest ? [beats.latest] : []), ...beats.after];
    const byAnchor = new Map<string | null, PrivateExchange<DmWhisper>[]>();
    for (const exchange of privateExchanges(whispers, story)) {
      byAnchor.set(exchange.anchorId, [...(byAnchor.get(exchange.anchorId) ?? []), exchange]);
    }
    return byAnchor;
  }, [beats, whispers]);
  const [earlierShown, setEarlierOpen] = useState(false);
  // An unread secret never folds away, so Earlier opens while it holds one.
  const unreadEarlier = [null, ...beats.earlier.map((entry) => entry.id)].some((anchor) =>
    exchanges.get(anchor)?.some((exchange) => exchange.unread),
  );
  const earlierOpen = earlierShown || unreadEarlier;
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
  const storyKey = (beats.after.at(-1) ?? beats.latest)?.id ?? "";
  const privateAfter = (anchor: string | null) =>
    exchanges.get(anchor)?.map((exchange) => (
      <CouchExchange
        key={exchange.id}
        exchange={exchange}
        storyKey={storyKey}
        onAsk={onAsk}
        watchRef={exchange.unread ? watchRef(exchange.id) : undefined}
      />
    ));
  const entry = (item: StoryEntry) => (
    <Fragment key={item.id}>
      {entryLine(item)}
      {privateAfter(item.id)}
    </Fragment>
  );
  const groupTag = (id: string) => {
    const tag = tags.get(id);
    if (!tag) return null;
    const mine = tag.sheetIds.includes(mySheetId);
    const who = tag.sheetIds.map((sheetId) => sheets.find((sheet) => sheet.id === sheetId)?.name).filter(Boolean) as string[];
    return <GroupTag place={tag.placeName} who={who} mine={mine} offScene={!tag.inScene} />;
  };
  const entryLine = (item: StoryEntry) =>
    item.kind === "gm" ? (
      <div key={item.id} className="couch-gm">
        {groupTag(item.id)}
        <span className="couch-label">The GM</span>
        <Passage content={item.content} rollsById={rollsById} nameOfSheet={nameOfSheet} />
      </div>
    ) : (
      <Post key={item.id} name={nameOf(item)} mine={item.userId === meUserId} content={item.content} tag={groupTag(item.id)} />
    );

  return (
    <section className="couch-story" aria-label="The story">
      {beats.earlier.length ? null : privateAfter(null)}
      {beats.earlier.length ? (
        <div>
          <button
            type="button"
            className="couch-earlier-toggle"
            aria-expanded={earlierOpen}
            aria-controls={earlierId}
            disabled={unreadEarlier}
            onClick={() => setEarlierOpen(!earlierOpen)}
          >
            {earlierOpen ? "Hide earlier" : "Earlier in the story"}
            <ChevronDown className="couch-chevron size-5" aria-hidden="true" />
          </button>
          {earlierOpen ? (
            <div id={earlierId} className="couch-earlier">
              {privateAfter(null)}
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
          {groupTag(beats.latest.id)}
          <span className="couch-label">The GM</span>
          <Passage content={beats.latest.content} rollsById={rollsById} nameOfSheet={nameOfSheet} />
        </article>
      ) : null}
      {beats.latest ? privateAfter(beats.latest.id) : (
        <p className="couch-muted">The story starts on the TV. What the GM says will be here too.</p>
      )}
      {beats.after.map(entry)}
    </section>
  );
}

// Which group of a split crew a passage or a move belongs to: its place,
// and "Your group" or who was in it.
function GroupTag({ place, who, mine, offScene }: { place: string; who: string[]; mine: boolean; offScene: boolean }) {
  return (
    <span className="couch-group-tag" data-mine={mine ? "" : undefined} data-off={offScene ? "" : undefined}>
      <MapPin size={14} aria-hidden="true" />
      <span className="sr-only">In </span>
      <span className="couch-group-place">{place}</span>
      <span className="couch-group-who">{mine ? "Your group" : who.join(", ")}</span>
      {offScene ? <span className="couch-group-off">Off scene</span> : null}
    </span>
  );
}

// What a player said or did, as a chat line: your own on the right.
function Post({ name, mine, content, tag }: { name: string; mine: boolean; content: string; tag?: ReactNode }) {
  return (
    <div className="couch-post" data-mine={mine ? "" : undefined} data-tagged={tag ? "" : undefined}>
      {tag}
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
        // A creature's attack is filed under the crew member it hit: the
        // line names who swung, not "Ro Arlen · Strike vs Ro Arlen".
        return roll ? <CouchRollChip key={part.id} roll={roll} who={roll.attacker?.name ?? nameOfSheet(roll.characterId)} /> : null;
      })}
    </div>
  );
}
