// Emoji reactions the user can place on a Dexter (assistant) message. Each
// reaction carries an explicit *meaning* and a learning signal: when the user
// reacts, we toast a confirmation, record a durable preference/feedback memory,
// and append a note to the agent's memory.md — so Dexter learns from approvals
// and mistakes and carries that signal into every later turn.

export type ReactionSentiment = "positive" | "negative" | "neutral";

export interface ChatReaction {
  /** The emoji glyph, also the stable key stored on the message. */
  emoji: string;
  /** Short machine id (used for keys / analytics). */
  id: string;
  /** Accessible label for the toggle button. */
  aria: string;
  /** Human meaning shown on hover. */
  meaning: string;
  /** Toast shown when the reaction is added. */
  toast: string;
  sentiment: ReactionSentiment;
  /** Builds the durable memory recorded when this reaction is added. */
  learn: (snippet: string) => { title: string; body: string };
}

function clip(snippet: string, max = 160): string {
  const clean = snippet.replace(/\s+/g, " ").trim();
  if (!clean) return "the previous response";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export const CHAT_REACTIONS: ChatReaction[] = [
  {
    emoji: "👀",
    id: "eyes",
    aria: "Mark as in progress (watching)",
    meaning: "Watching — this is still being worked on",
    toast: "👀 Noted — Dexter knows this is in progress and you're watching.",
    sentiment: "neutral",
    learn: (snippet) => ({
      title: "Reaction 👀 — work in progress",
      body: `The user marked this output as in-progress / being watched: "${clip(snippet)}". Keep iterating on it and post visible progress updates rather than treating it as final.`,
    }),
  },
  {
    emoji: "✅",
    id: "check",
    aria: "Approve this output",
    meaning: "Approved — this is good and accepted",
    toast: "✅ Approved — Dexter will treat this as the accepted approach.",
    sentiment: "positive",
    learn: (snippet) => ({
      title: "Reaction ✅ — approved output",
      body: `The user approved this output: "${clip(snippet)}". Treat this format and direction as accepted; reuse this approach for similar requests.`,
    }),
  },
  {
    emoji: "👍",
    id: "thumbs-up",
    aria: "Thumbs up — good output",
    meaning: "Good — I liked this",
    toast: "👍 Glad that landed — Dexter will keep doing more like this.",
    sentiment: "positive",
    learn: (snippet) => ({
      title: "Reaction 👍 — positive feedback",
      body: `The user reacted positively to this output: "${clip(snippet)}". Lean into this style, tone, and level of detail going forward.`,
    }),
  },
  {
    emoji: "👎",
    id: "thumbs-down",
    aria: "Thumbs down — output not desired",
    meaning: "Not desired — the presentation or output missed",
    toast: "👎 Got it — Dexter will avoid this and adjust next time.",
    sentiment: "negative",
    learn: (snippet) => ({
      title: "Reaction 👎 — output not desired",
      body: `The user was NOT satisfied with this output: "${clip(snippet)}". Avoid repeating this presentation/answer. Next time, change the approach (format, tone, depth, or direction) and, if unsure why it missed, ask one quick clarifying question before redoing it.`,
    }),
  },
];

export function getReaction(emoji: string): ChatReaction | undefined {
  return CHAT_REACTIONS.find((reaction) => reaction.emoji === emoji);
}
