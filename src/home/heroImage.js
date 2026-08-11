// Which image the homepage hero shows.
//
// A module rather than a literal in the component so seasonal or personalised
// imagery becomes a change here — a second entry and a rule for choosing between
// them — instead of a component rewrite. No scheduling, no CMS, no per-customer
// asset pipeline is built today: HOME_OPERATING_SYSTEM.md puts personalised home
// imagery in a much later horizon, and building the switch before there is a second
// image to switch to would be exactly the speculative infrastructure the brief rules
// out. The seam is here; the machinery is not.
//
// Honest status, stated where the code is rather than only in a document: the asset
// below is NOT photography. docs/design/ILLUSTRATION_GUIDELINES.md records that zero
// photography assets exist anywhere in this repository, and
// docs/product/HOMEPAGE_DIRECTION.md is explicit that real sourcing is separate work
// nobody has done. This is a locally-authored stand-in holding the frame a
// commissioned photograph drops into — `isPhotography: false` is the flag to flip
// when that happens.

const HOME_HERO_IMAGE = {
  id: "living-room",
  // Vector, so it is resolution-independent and needs no srcset today. A real
  // photograph will want `sources` populated with AVIF/WebP entries — the <picture>
  // in HomeHero.jsx already renders them, it simply has none to render yet.
  src: "/home/hero-living-room.svg",
  sources: [],
  isPhotography: false,
};

// Deliberately not random: the brief rules out rotating the image on every render,
// and a hero that changes under the customer between two visits reads as instability,
// not delight.
export function selectHomeHero() {
  return HOME_HERO_IMAGE;
}
