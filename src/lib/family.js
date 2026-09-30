// Family uses the existing authenticated API boundary; no client-side access decisions.
import { supabase } from './supabaseClient';
import { uuidv7 } from './ids.js';

export async function fetchFamily(workspaceId = null) {
  const { data, error } = await supabase.schema('api').rpc('family_snapshot', { p_workspace_id: workspaceId });
  if (error) throw error;
  return data;
}

export function familyCommand(workspaceId, action, payload) {
  return { p_command_id: uuidv7(), p_workspace_id: workspaceId, p_action: action,
    p_payload: payload, p_ids: Array.from({ length: 8 }, () => uuidv7()) };
}

export async function sendFamilyCommand(command) {
  const { data, error } = await supabase.schema('api').rpc('family_command', command);
  if (error) throw error;
  return data;
}

export function createInviteToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, '0')).join('');
}
