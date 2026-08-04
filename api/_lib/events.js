// Thin wrapper around the emit_domain_event() RPC (see migration 0010) — the seed of
// Core's event bus. Only the two events this phase's work actually produces are wired
// up (ai_intake.analyzed, message.translated); the rest of the chain
// (RequestCreated → ... → ReviewSubmitted) gets wired as each owning phase ships, per
// the roadmap. A failure here should never break the caller's actual request, so
// emitEvent swallows its own errors after logging them.
export async function emitEvent(supabase, eventType, payload = {}) {
  try {
    const { error } = await supabase.rpc("emit_domain_event", { p_event_type: eventType, p_payload: payload });
    if (error) console.error(`emitEvent(${eventType}) failed:`, error.message);
  } catch (err) {
    console.error(`emitEvent(${eventType}) threw:`, err.message);
  }
}
