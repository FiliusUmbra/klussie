import { useState } from 'react';
import { Heart, ArrowLeft, RefreshCw, Sun, ListChecks, CalendarDays, Users, CheckCheck } from 'lucide-react';
import { useAuth } from '../lib/auth.jsx';
import { useLang } from '../lib/lang';
import { familyStrings } from '../lib/familyStrings.js';
import { createInviteToken } from '../lib/family.js';
import { familyErrorKey, dateKey } from '../lib/familyModel.js';
import { useFamily } from './useFamily.js';
import { FamilyEditor } from './FamilyEditor.jsx';
import { Today } from './FamilyParts.jsx';
import { ListsAndChores, FamilyCalendar, FamilyPeople } from './FamilyPanels.jsx';
import { FAMILY_CSS } from './familyStyles.js';
const SECTIONS = [['today',Sun],['lists',ListChecks],['chores',CheckCheck],['calendar',CalendarDays],['people',Users]];
export function FamilyApp({ onClose, initialId, section, onSectionChange }) {
  const { user } = useAuth();
  return <FamilySpace key={`${user.id}:${initialId || ''}`} onClose={onClose} initialId={initialId} routedSection={section} onSectionChange={onSectionChange} />;
}
function FamilySpace({ onClose, initialId, routedSection, onSectionChange }) {
  const { langCode, fmtDate, LANGS } = useLang();
  const { profile, refreshProfile } = useAuth();
  const f = familyStrings(langCode);
  const state = useFamily(initialId);
  const { selected, setSelected, groups, data, error, busy, refresh, run, ready } = state;
  // Route-driven when App.jsx supplies one (live review 2026-10-04, item 15), local otherwise.
  const [localSection,setLocalSection] = useState('today');
  const section = routedSection || localSection;
  const setSection = (next) => { if (onSectionChange) onSectionChange(next); else setLocalSection(next); };
  const [selectedList,setSelectedList] = useState(null);
  const [editor,setEditor] = useState(null);
  const [actionError,setActionError] = useState('');
  const [invite,setInvite] = useState(null);
  const [tokenDraft,setTokenDraft] = useState(null);
  const select = (id) => { setSelected(id);setEditor(null);setInvite(null);setTokenDraft(null);setActionError(''); };
  const save = async (action,payload) => {
    const result = await run(action,payload);
    if (action==='create' || action==='join') { try {await refreshProfile();} catch { /* Family is already saved. */ } }
    if (action==='revoke_invite' && invite?.id===payload.id) setInvite(null);
    return result;
  };
  const complete = async (task) => {
    setActionError('');
    try { await run('complete',{id:task.id,version:task.version,today:dateKey()}); }
    catch(err) {setActionError(f[familyErrorKey(err)]);}
  };
  const inviteAdult = async () => {
    setActionError(''); const token = tokenDraft || createInviteToken();setTokenDraft(token);
    try {const result=await run('invite',{token});setInvite({id:result.id,token});setTokenDraft(null);}
    catch(err) {setActionError(f[familyErrorKey(err)]);}
  };
  const onTab = (tab,list) => { setSection(tab);if(list)setSelectedList(list); };
  const common = {data,f,fmtDate,busy,onComplete:complete,onEdit:setEditor};
  return <div className="family-app"><style>{FAMILY_CSS}</style>
    <header className="family-header"><button type="button" className="family-back" onClick={onClose}><ArrowLeft size={16} aria-hidden="true" />{f.back}</button><div className="family-title"><Heart aria-hidden="true" /><h1>{f.title}</h1></div><p>{f.tagline}</p>
      {groups.length>0 && <div className="family-toolbar"><label className="family-field"><span>{f.familyName}</span><select disabled={busy} value={selected || ''} onChange={(e) => select(e.target.value)}>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>{section==='people' && <><button className="family-text-button" type="button" onClick={() => setEditor({type:'create'})}>{f.newFamily}</button><button className="family-text-button" type="button" onClick={() => setEditor({type:'join'})}>{f.join}</button></>}<button className="family-icon-button" aria-label={f.refresh} type="button" disabled={busy} onClick={refresh}><RefreshCw size={18} /></button></div>}
    </header>
    {error && <div className="family-error" role="alert">{f.loadFailed} <button type="button" onClick={refresh}>{f.retry}</button></div>}
    {actionError && <p className="family-error" role="alert">{actionError}</p>}
    {!ready && !error && <p role="status">{f.loading}</p>}
    {ready && !groups.length && !error && <section className="family-welcome"><Heart size={40} aria-hidden="true" /><h2>{f.welcome}</h2><p>{f.intro}</p><div className="family-actions"><button className="btn-primary" type="button" onClick={() => setEditor({type:'create'})}>{f.create}</button><button className="btn-secondary" type="button" onClick={() => setEditor({type:'join'})}>{f.join}</button></div><p className="family-privacy">{f.privacy}</p></section>}
    {selected && !data && !error && <p role="status">{f.loading}</p>}
    {data && <>
      <nav className="family-nav" aria-label={f.title}>{SECTIONS.map(([key,Icon]) => <button type="button" key={key} aria-current={section===key?'page':undefined} onClick={() => setSection(key)}><Icon size={18} aria-hidden="true" />{key==='chores'?f.navChores:key==='people'?f.navPeople:f[key]}</button>)}</nav>
      <main className="family-main" key={selected}>
        {section==='today' && <Today {...common} onTab={onTab} />}
        {['lists','chores'].includes(section) && <ListsAndChores key={section} {...common} mode={section} selectedList={selectedList} setSelectedList={setSelectedList} />}
        {section==='calendar' && <FamilyCalendar {...common} locale={LANGS?.find((l) => l.code===langCode)?.locale || 'en-GB'} />}
        {section==='people' && <FamilyPeople {...common} onInvite={inviteAdult} inviteToken={invite?.token} />}
      </main>
    </>}
    {editor && <FamilyEditor key={`${editor.type}:${editor.record?.id || 'new'}:${selected}`} editor={editor} f={f} people={data?.people || []} busy={busy} onSave={save} onClose={() => setEditor(null)} displayName={profile?.full_name} />}
  </div>;
}
