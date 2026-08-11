// Homepage intent configuration — what Klussie asks after a customer says what
// kind of thing they need, before any AI call happens.
//
// This is configuration, not rendering (Constitution Rule 2: business decisions are
// data). The homepage reads it; it never hardcodes a question, an order, or a
// hazard rule inside JSX. Adding an intent or reordering a sequence is an edit
// here plus two locale keys, never a component change.
//
// Intent comes before input method deliberately: "Er is iets kapot" is what the
// customer is thinking, "Vertel het me gewoon" is only how they'd say it.

// `labelKey` / `questionKey` are keys into `t` (src/lib/homeStrings.js and
// src/lib/homeFollowUpStrings.js) — never literal copy, so all 8 locales stay real.
//
// answerMode:
//   "text"  — typed, spoken, or photographed; the composer stays fully available.
//   "photo" — the question is itself an invitation to show something, so the photo
//             action is the emphasised answer. Still skippable and still typeable:
//             a customer who can't take a photo must never be stuck.
//
// knownFact: names the piece of Property Memory that would make this question
// redundant. Nothing populates these yet (no home_assets schema exists — ADR-0008,
// ROADMAP Phase 13), but the filter below is real, so the question disappears the
// day the data arrives rather than needing a second pass over this file.
export const HOME_INTENTS = [
  {
    id: "broken",
    labelKey: "intentBroken",
    hazardCheck: true,
    questions: [
      { id: "what", questionKey: "fuBrokenWhat", answerMode: "text" },
      { id: "where", questionKey: "fuBrokenWhere", answerMode: "text", knownFact: "rooms" },
      { id: "photo", questionKey: "fuBrokenPhoto", answerMode: "photo" },
      { id: "since", questionKey: "fuBrokenSince", answerMode: "text" },
      { id: "urgent", questionKey: "fuBrokenUrgent", answerMode: "text" },
      { id: "when", questionKey: "fuBrokenWhen", answerMode: "text" },
    ],
  },
  {
    id: "improve",
    labelKey: "intentImprove",
    questions: [
      { id: "what", questionKey: "fuImproveWhat", answerMode: "text" },
      { id: "where", questionKey: "fuImproveWhere", answerMode: "text", knownFact: "rooms" },
      { id: "result", questionKey: "fuImproveResult", answerMode: "text" },
      { id: "inspiration", questionKey: "fuImproveInspiration", answerMode: "photo" },
      { id: "budget", questionKey: "fuImproveBudget", answerMode: "text" },
      { id: "when", questionKey: "fuImproveWhen", answerMode: "text" },
    ],
  },
  {
    id: "maintain",
    labelKey: "intentMaintain",
    questions: [
      { id: "what", questionKey: "fuMaintainWhat", answerMode: "text" },
      { id: "last", questionKey: "fuMaintainLast", answerMode: "text", knownFact: "maintenanceHistory" },
      { id: "saved", questionKey: "fuMaintainSaved", answerMode: "text", knownFact: "installations" },
      { id: "recurring", questionKey: "fuMaintainRecurring", answerMode: "text" },
      { id: "dates", questionKey: "fuMaintainDates", answerMode: "text" },
    ],
  },
  {
    id: "advice",
    labelKey: "intentAdvice",
    questions: [
      { id: "about", questionKey: "fuAdviceAbout", answerMode: "text" },
      { id: "topic", questionKey: "fuAdviceTopic", answerMode: "text" },
      { id: "doc", questionKey: "fuAdviceDoc", answerMode: "photo" },
      { id: "want", questionKey: "fuAdviceWant", answerMode: "text" },
    ],
  },
  // No sequence: "something else" exists precisely because the four above didn't fit,
  // so scripting it would be guessing. The composer opens on the generic prompt and
  // the AI intake asks whatever it actually needs.
  { id: "other", labelKey: "intentOther", questions: [] },
];

export function findIntent(intentId) {
  return HOME_INTENTS.find((i) => i.id === intentId) || null;
}

// Drops questions whose answer Klussie already holds. `knownFacts` is the shape
// src/lib/homeInventory.js returns: a set of fact names that genuinely have data
// behind them for this customer. Empty today, which is why every question is asked
// today — an honest starting point, not a permanent one.
export function questionsFor(intentId, knownFacts) {
  const intent = findIntent(intentId);
  if (!intent) return [];
  const known = knownFacts instanceof Set ? knownFacts : new Set(knownFacts || []);
  return intent.questions.filter((q) => !q.knownFact || !known.has(q.knownFact));
}

// Words that mean "this might not be a repair job at all," in every supported locale.
//
// Calibrated, not maximal. The first draft used bare "gas" and bare "lek" and
// interrupted on "mijn kraan lekt" and on every boiler request — a safety warning that
// fires on the most ordinary plumbing job in the catalogue is one customers learn to
// tap through, which makes it worth less than nothing on the day it matters. So the
// ambiguous single words are here only as the phrases that actually signal danger
// ("gaslek", "ruik gas"), while the unambiguous ones ("kortsluiting", "koolmonoxide")
// stand alone. Erring toward one extra tap is still the right trade — but only where
// the term genuinely carries the risk.
//
// Substring matching rather than word boundaries, because "gaslek", "wasserschaden"
// and "煤气" are all single tokens that boundary matching in a Latin-centric regex
// would miss.
const HAZARD_TERMS = [
  // nl
  "gaslek", "gasgeur", "gaslucht", "ruik gas", "brand", "vuur", "rook", "kortsluiting",
  "vonk", "stroomstoot", "elektrische schok", "wateroverlast", "overstroming",
  "instorten", "ingestort", "verzakking", "koolmonoxide", "co-melder",
  // fr
  "fuite de gaz", "odeur de gaz", "incendie", "feu", "fumée", "court-circuit",
  "étincelle", "inondation", "effondrement", "monoxyde", "choc électrique",
  // de
  "gasgeruch", "gasleck", "feuer", "brandgeruch", "rauch", "kurzschluss", "funken",
  "überschwemmung", "wasserschaden", "einsturz", "kohlenmonoxid", "stromschlag",
  // en
  "gas leak", "smell of gas", "smell gas", "fire", "smoke", "short circuit", "spark",
  "flood", "carbon monoxide", "electric shock", "burning smell", "collapse",
  // tr
  "gaz kaçağı", "gaz kokusu", "yangın", "duman", "kısa devre", "kıvılcım",
  "su baskını", "çökme", "elektrik çarpması",
  // ru
  "утечка газа", "запах газа", "пожар", "дым", "короткое замыкание", "искр",
  "затопление", "обруш", "удар током",
  // ar
  "تسرب غاز", "رائحة غاز", "حريق", "دخان", "ماس كهربائي", "فيضان", "انهيار",
  // zh
  "煤气", "燃气泄漏", "着火", "火灾", "冒烟", "短路", "淹水", "坍塌", "一氧化碳", "触电",
];

// True when the customer's words suggest gas, electricity, fire, flooding, or a
// structural hazard. Used to interrupt with a safety message instead of continuing
// as a normal request — Klussie must not treat "I smell gas" as a booking funnel.
//
// This is a keyword screen, not a diagnosis, and the copy it triggers says so
// (`safetyBody`). Deliberately not an AI call: the interruption has to be instant
// and has to work when the gateway is down.
export function detectsHazard(text) {
  if (!text) return false;
  const haystack = String(text).toLowerCase();
  return HAZARD_TERMS.some((term) => haystack.includes(term));
}

// The transcript the intent + its answers become — one string, in the customer's own
// words, prefixed by the intent so the AI intake reads it the way a person would.
// Question text is included so a one-word answer ("kelder") still carries its meaning.
export function composeIntentTranscript({ intentLabel, entries }) {
  const lines = (entries || [])
    .filter((e) => e.answer && e.answer.trim())
    .map((e) => `${e.question} ${e.answer.trim()}`);
  return [intentLabel, ...lines].filter(Boolean).join(" — ");
}
