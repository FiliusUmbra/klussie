import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DailyHome } from '../DailyHome.jsx';
import { dateKey } from '../../lib/familyModel.js';
const state = vi.hoisted(() => ({}));
vi.mock('../../family/useFamily.js', () => ({useFamily: () => state}));
vi.mock('../../lib/lang', () => ({useLang: () => ({langCode:'en',fmtDate:(d)=>d,serviceInfo:()=>({name:'Repair'}),t:{homeForYouTitle:'For you',navDiscover:'Help',navMyHome:'My Home',navRequests:'Requests',navMessages:'Messages',statusQuotesReady:'Choose a quote',helpReplayTour:'Replay tour'}})}));
// PageTour.jsx itself has its own test file — stubbed here to false/no-op so these
// pre-existing tests stay focused on DailyHome's own daily-summary concerns, the same
// way useHomeTour.js's own "open" gets held closed in CustomerApp's own tests.
const tourState = vi.hoisted(() => ({ open: false }));
vi.mock('../../ui/usePageTour.js', () => ({ usePageTour: () => ({ open: tourState.open, finish: vi.fn(), replay: vi.fn() }) }));
afterEach(cleanup);
beforeEach(() => Object.assign(state,{selected:'family-2',groups:[{id:'family-2',name:'Our family'}],data:{tasks:[],events:[],people:[]},ready:true,error:false,refresh:vi.fn(),setSelected:vi.fn()}));
const props = () => ({requests:[],conversations:[],onHelp:vi.fn(),onHome:vi.fn(),onFamily:vi.fn(),onRequest:vi.fn(),onMessages:vi.fn(),onRequests:vi.fn()});
describe('DailyHome',()=>{
 it('opens decisions and unread messages without including finished requests',()=>{
  const p=props();render(<DailyHome {...p} requests={[{id:'r',status:'quotes_ready'},{id:'done',status:'reviewed'}]} conversations={[{unreadCount:2}]} />);
  fireEvent.click(screen.getByText('Repair'));expect(p.onRequest).toHaveBeenCalledWith('r');
  fireEvent.click(screen.getByText('Messages'));expect(p.onMessages).toHaveBeenCalled();
  expect(screen.getAllByText('Repair')).toHaveLength(1);
 });
 it('shows due chores and ongoing holidays and carries the selected family into navigation',()=>{
  const p=props();state.data={people:[],tasks:[{id:'due',title:'Due chore',due_on:dateKey()},{id:'later',title:'Later',due_on:'2999-01-01'}],events:[{id:'trip',title:'Holiday',starts_on:'2020-01-01',ends_on:'2999-01-01'}]};
  render(<DailyHome {...p}/>);expect(screen.queryByText('Later')).toBeNull();expect(screen.getByText('Holiday')).toBeTruthy();
  fireEvent.click(screen.getByText('Due chore'));expect(p.onFamily).toHaveBeenCalledWith('family-2');
 });
 it('shows a family load error rather than an empty-family invitation',()=>{
  state.error=true;state.ready=false;state.data=null;state.groups=[];render(<DailyHome {...props()}/>);
  expect(screen.getByRole('alert')).toBeTruthy();expect(screen.queryByText('Make room for everyday life')).toBeNull();
  fireEvent.click(screen.getByText('Try again'));expect(state.refresh).toHaveBeenCalled();
 });
 it('wires data-tour anchors onto Help, My Home and Family for PageTour.jsx to find',()=>{
  render(<DailyHome {...props()}/>);
  expect(document.querySelector('[data-tour="today-help"]')).toBeTruthy();
  expect(document.querySelector('[data-tour="today-myhome"]')).toBeTruthy();
  expect(document.querySelector('[data-tour="today-family"]')).toBeTruthy();
 });
});
