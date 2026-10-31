// The opening readout and the phone reference share the rules we actually
// run. Stress, pushing and spending story points are not implemented yet.
export const COUCH_PLAY_RULES = [
  { title: "Choose what you do", text: "Use Do for an action, Say for your character's words, Private for a message only the GM reads, or Pass to let the others act. When everyone has answered, the narrator continues." },
  { title: "When dice decide", text: "Ordinary, safe actions need no roll. When an action is uncertain and failure matters, the GM calls for a check. Impossible actions cannot succeed by rolling." },
  { title: "Rolling your dice", text: "When the GM calls for your roll, your phone shows what it is for, your dice, your bonus and the target. Tap the die to throw it and watch it land on the TV, where everyone sees every throw." },
  { title: "How a check works", text: "A check is a twenty-sided die plus your character's bonus. A total equal to or above the target succeeds. Advantage rolls two dice and keeps the higher; disadvantage keeps the lower. A natural 1 or 20 alone does not decide an ordinary check, but a natural 20 always passes a long shot, which the GM names before you roll." },
  { title: "Danger and consequences", text: "Attack rolls decide whether a blow hits; damage dice decide how much health it takes. Initiative decides who acts first. The narrator explains what each result changes in the scene. Health is tracked on your phone and the TV; reaching zero can be deadly." },
  { title: "Your private agenda", text: "Your agenda is yours to reveal. It changes with each act, and pursuing it can earn story points. For now, these points record your progress; they cannot be spent on rerolls." },
  { title: "Pause whenever you need", text: "Speak up to pause or ask about a rule. This is a shared story, and anyone can say when something is uncomfortable." },
] as const;

export const COUCH_RULES_BRIEFING = `Before we begin, here is how we play.\n\n${COUCH_PLAY_RULES.map((rule) => rule.text).join("\n\n")}`;
