// Latest-request wins on family changes; polling never discards an open editor's draft.
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchFamily, familyCommand, sendFamilyCommand } from '../lib/family.js';
const REFRESH_MS = 30000;
export function useFamily(initialId) {
  const [selected, setSelected] = useState(initialId || null);
  const [snapshot, setSnapshot] = useState(null);
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const pending = useRef(null);
  const inFlight = useRef(false);
  const refresh = useCallback(() => {
    const token = ++request.current;
    return fetchFamily(selected).then((next) => {
      if (token !== request.current) return;
      setGroups(next.groups); setSnapshot(next); setError(false);
      if (!selected && next.groups.length) setSelected(next.groups[0].id);
    }).catch((err) => {
      if (token !== request.current) return;
      setError(true);
      if (err?.code === '42501') setSnapshot(null);
    });
  }, [selected]);
  useEffect(() => {
    const counter = request;
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const focus = () => refresh();
    window.addEventListener('focus', focus);
    return () => { ++counter.current; clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [refresh]);
  const run = async (action, payload) => {
    if (inFlight.current) throw new Error('busy');
    inFlight.current = true; setBusy(true);
    const signature = JSON.stringify([selected, action, payload]);
    if (pending.current?.signature !== signature) pending.current = { signature, command: familyCommand(selected, action, payload) };
    try {
      const result = await sendFamilyCommand(pending.current.command);
      pending.current = null;
      if (result.workspaceId !== selected) setSelected(result.workspaceId);
      else await refresh(); // A failed refresh doesn't turn a successful write into a failed write.
      return result;
    } finally { inFlight.current = false; setBusy(false); }
  };
  const data = snapshot?.workspaceId === selected ? snapshot : null;
  return { selected, setSelected, groups, data, ready: snapshot !== null, error, busy, refresh, run };
}
