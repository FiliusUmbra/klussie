# Klussie — Digital Property Memory

**This document owns:** the long-term product *philosophy* underneath
"My Home" — what it means for Klussie to understand a property, not just
log events about it. It does not own the product design built on top of
this philosophy (`HOME_OPERATING_SYSTEM.md`) or any implementation.

> Transcribed into the repository from a conversation-only artifact
> (`digital-property-memory.html`, published 2026-08-06). No screens, no
> navigation, nothing implemented here — this is the underlying belief
> the whole "My Home" concept sits on top of.

## 1 · The Reframe

Not what happened. What it means. A transaction log tells you a boiler
was serviced on a date, by someone, for a price. That's true, and it's
almost useless on its own. A longtime family doctor doesn't just have
your file — they remember that you tend to shrug off symptoms until
they're serious, that a certain medication never agreed with you, that
this year's cough sounds like last year's. That's the difference between
records and memory. Digital Property Memory is Klussie building the
second thing, not just accumulating more of the first.

> Every repair becomes knowledge. Every booking enriches the property's
> memory. Every interaction makes the next one **easier** — not just
> longer.

## 2 · From Data to Understanding

Four rungs. Most systems stop at the first. The goal was never more data
— a bigger database of timestamped events is still just a longer list.
Understanding is a different thing entirely, and it only shows up a few
steps further along. The same boiler, followed through all four:

1. **Data** — "Boiler serviced Mar 14, €120."
2. **Knowledge** — "Twice in 18 months — more than typical."
3. **Understanding** — "Pattern fits this area's water hardness, not bad
   luck."
4. **Prediction** — "Expect the next service need in 8–10 months."

Most platforms stop at the first step. Klussie's memory is the other
three.

## 3 · What Klussie Should Know, By Year

**One year in.** Mostly data, the beginnings of knowledge. A handful of
jobs, a professional or two the household already trusts. Klussie
recognizes the home — it doesn't yet see its patterns. This is the stage
most "smart home" products stop at, mistaking a longer history for a
deeper one.

**Five years in.** Real knowledge, the first real understanding. Enough
history to see what's specific to this home: which systems age faster
than average, which professional's style actually fits this household,
which seasons bring which problems. Klussie starts noticing things the
homeowner hasn't consciously tracked themselves.

**Ten years in.** Real understanding, real prediction. Klussie knows this
property close to the way a longtime contractor would — not because the
model got smarter in the abstract, but because it has watched this
specific home, and only this one, for a decade. That kind of knowledge
cannot be bought, scraped, or launched with a bigger training run. It can
only be earned by being present.

## 4 · The Elements, As Categories of Understanding

Not a schema. A way of thinking about what's remembered. Assets, systems,
rooms, appliances, professionals, history, knowledge, predictions,
maintenance, documents, two lifecycles — a long list on its own. Grouped
by what kind of understanding each one feeds:

- **What the property is** — assets · systems · rooms · appliances — the
  physical facts.
- **What has happened to it** — history · maintenance · documents — the
  record.
- **Who has cared for it** — professionals — the relationships.
- **What it's becoming** — knowledge · predictions · ownership and
  property lifecycle — the understanding.

The first three groups are what most products already collect. The
fourth is the one that's actually new — and it's the only one that can't
be filled in by asking the user more questions. It has to be earned by
watching, over time.

## 5 · Two Clocks

The person who owns the home, and the home itself, are on different
timelines. A family moves in, lives there, and one day moves out. That's
the **ownership lifecycle** — bounded, personal, it can end and restart
with someone new. But the roof doesn't reset when the sale closes. It was
installed in a particular year and it will need replacing in a particular
decade, regardless of whose name is on the deed. That's the **property
lifecycle** — continuous, physical, indifferent to who's living there.

**Deliberately not answered here:** an unresolved, real question follows
from this — when a sale happens, does the memory transfer with the house,
or leave with the owner? There's a real argument that a home's
maintenance history is more valuable to the next owner than to a
departing one — and a real privacy and consent question underneath it
that a philosophy document shouldn't resolve by default. Worth a real
decision later, not an assumption now.

## 6 · How Klussie Learns

Two loops, not one.

**The private loop:** this specific home's patterns deepen with every
job. Private to that household, and the more valuable of the two to the
family living there.

**The shared loop:** patterns learned in aggregate, across many homes of
a similar era, region, or construction — make even someone's very first
booking smarter, without any single home's specifics ever being exposed
to inform another's. This is the real substance behind `ROADMAP.md`'s
already-planned Intelligence Platform phase (Phase 10); it only works if
aggregation stays genuinely aggregate.

The second loop is the one that makes Klussie's understanding valuable to
people who've never used it before — but it's also the one with the real
design constraint: cross-property learning has to work without anyone's
individual home becoming legible to anyone else. That constraint isn't a
detail to solve later; it's load-bearing for whether this is trustworthy
at all.

## 7 · What This Is Not

The boundaries matter as much as the ambition.

- **NOT a surveillance system.** Klussie remembers to help, never to
  monitor. Nothing here observes a home; it only remembers what the
  home's own repairs have already told it.
- **NOT a valuation tool.** Real estate appraisal wants to maximize a
  sale price. Klussie wants to help someone take care of what they own.
  Those incentives aren't always the same thing, and Klussie stays on the
  homeowner's side when they diverge.
- **NOT a decision-maker.** Understanding gets surfaced; the homeowner
  decides. Nothing here books, schedules, or acts without explicit
  confirmation.
- **NOT a data product.** Property memory is never sold or exposed to a
  third party without specific, explicit consent — the same rule that
  already governs how Platform API integrations (`ROADMAP.md` Phase 11)
  are meant to work. Trust beats growth, including when growth is the
  easier path.

## 8 · Why This Compounds

A marketplace resets every visit. This doesn't. Search a marketplace
twice and it's learned nothing between visits — every session starts
cold. Digital Property Memory compounds in two directions at once: the
private loop makes *this* household's next interaction faster and
better-informed than its last one; the shared loop means the platform's
overall understanding is a little deeper for everyone tomorrow than it
was today, even for someone opening Klussie for the very first time.

> That's the actual answer to why it becomes more valuable every time
> someone uses it: **not because more data accumulates** — because more
> of it turns into understanding, and understanding, unlike a database,
> gets more useful the longer it's had time to learn.

---

No new screens. No implementation. Just what the whole product should
believe about the thing it's helping people take care of.

---

Version 1.0 — 2026-08-06 (transcribed into the repository from the
conversation-only artifact)
