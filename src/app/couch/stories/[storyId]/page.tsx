import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { PageNotice, PageSection, PageShell } from "@/components/PageShell";
import { currentUser } from "@/lib/auth";
import { scenarioCard } from "@/lib/couch/scenario-cards";
import { writtenScenario } from "@/lib/couch/scenarios";
import { PIXEL_ICONS } from "@/lib/ui";

// A ready-made night read in full, spoilers and all, for debugging a story:
// the truth, the threat, the acts and their scares, the cast and every crew
// member's agenda and the hidden role. Server-rendered and for the server's
// admins only, since the server is public through the tunnel and a player
// who found this page would know the twist. The couch-night picker links
// here from each card when its viewer is an admin.

export const dynamic = "force-dynamic";

export default async function CouchStoryPage({ params }: { params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  const user = await currentUser();
  if (!user?.isAdmin) {
    return (
      <PageNotice user={user ?? null}>
        Admins only: this page gives the whole story away.{" "}
        <Link href="/couch" className="text-amber-200 hover:text-amber-400">
          Back to couch night
        </Link>
      </PageNotice>
    );
  }
  const written = writtenScenario(storyId);
  const card = scenarioCard(storyId);
  if (!written || !card) {
    notFound();
  }
  const { scenario, styleLock, hiddenRole, crew } = written.reply;

  return (
    <PageShell
      user={user}
      icon={PIXEL_ICONS.story}
      glyph="ui-act"
      width="wide"
      className="max-w-4xl"
      title={scenario.title}
      blurb={`Spoilers: the whole story as the GM gets it. ${card.setting}, ${card.players.min} to ${card.players.max} players${written.site ? `, played on the ${written.site} map` : ""}.`}
      actions={
        <Link href={`/couch?scenario=${card.id}`} className="text-sm text-amber-200 hover:text-amber-400">
          Back to the picker
        </Link>
      }
    >
      <PageSection heading="The story">
        <Facts
          rows={[
            ["Logline", scenario.logline],
            ["Briefing", scenario.briefing],
            ["Setting", scenario.setting],
            ["Truth", scenario.truth],
            ["Threat", scenario.threat],
            ["Hidden role", `${hiddenRole.crewMember}: ${hiddenRole.role}`],
            ["Style lock", styleLock],
            ...(scenario.minutes ? ([["Length", `${scenario.minutes} minutes`]] as Array<[string, string]>) : []),
          ]}
        />
      </PageSection>

      {scenario.acts.map((act, index) => (
        <PageSection key={act.title} heading={`Act ${index + 1}: ${act.title}`}>
          <Facts
            rows={[
              ["Goal", act.goal],
              ["Escalation", act.escalation],
              ["Clock", act.clock],
              ["Twist", act.twist],
            ]}
          />
          <SubHead>Set pieces</SubHead>
          <List items={act.setPieces} />
          {act.beats?.length ? (
            <>
              <SubHead>Beats</SubHead>
              <List items={act.beats.map((beat) => <Tagged key={beat.what} tag={beat.kind} text={beat.what} />)} />
            </>
          ) : null}
          {scenario.foes.some((foe) => foe.act === index + 1) ? (
            <>
              <SubHead>Foes</SubHead>
              <List
                items={scenario.foes
                  .filter((foe) => foe.act === index + 1)
                  .map((foe) => <Tagged key={foe.name} tag={foe.name} text={foe.what} />)}
              />
            </>
          ) : null}
        </PageSection>
      ))}

      <PageSection heading="Crew">
        <p className="text-sm text-stone-400">In seat order: a night for N players seats the first N.</p>
        <div className="mt-3 space-y-5">
          {crew.map((member, index) => (
            <article key={member.name} className="rounded-lg border border-stone-700/60 bg-stone-950/50 p-4">
              <h3 className="font-display text-lg text-amber-100">
                {index + 1}. {member.name}
                <span className="ml-2 text-sm text-stone-400">
                  {member.crewRole} · {member.career} · {member.gender}
                </span>
                {member.name === hiddenRole.crewMember ? (
                  <span className="ml-2 rounded-full border border-red-500/50 bg-red-950/50 px-2 py-0.5 text-xs text-red-200">Hidden role</span>
                ) : null}
              </h3>
              <Facts
                rows={[
                  ["Look", member.look],
                  ["Personality", member.personality],
                  ["Backstory", member.backstory],
                  ["Voice", member.voice],
                  ["Signature item", member.signatureItem],
                ]}
              />
              <SubHead>Agenda, act by act</SubHead>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-stone-200">
                {member.agenda.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              {member.relationships.length ? (
                <>
                  <SubHead>Ties</SubHead>
                  <List items={member.relationships.map((tie) => <Tagged key={tie.to} tag={tie.to} text={tie.line} />)} />
                </>
              ) : null}
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection heading="Cast">
        <div className="space-y-4">
          {scenario.cast.map((person) => (
            <article key={person.name}>
              <h3 className="font-display text-base text-amber-100">
                {person.name} <span className="text-sm text-stone-400">{person.role}</span>
              </h3>
              <Facts
                rows={[
                  ["Look", person.look],
                  ["Voice", person.voice],
                  ["Agenda", person.agenda],
                  ["Secret", person.secret],
                ]}
              />
            </article>
          ))}
        </div>
      </PageSection>

      <PageSection heading="Locations">
        <List items={scenario.locations.map((place) => <Tagged key={place.name} tag={place.name} text={place.look} />)} />
      </PageSection>
    </PageShell>
  );
}

function Facts({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="mt-2 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[9rem_1fr]">
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="font-medium text-amber-200/90">{term}</dt>
          <dd className="leading-relaxed text-stone-200">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SubHead({ children }: { children: ReactNode }) {
  return <h4 className="mt-4 text-xs font-medium uppercase tracking-[0.2em] text-amber-200/80">{children}</h4>;
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-relaxed text-stone-200">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}

function Tagged({ tag, text }: { tag: string; text: string }) {
  return (
    <>
      <span className="font-medium text-amber-100">{tag}:</span> {text}
    </>
  );
}
