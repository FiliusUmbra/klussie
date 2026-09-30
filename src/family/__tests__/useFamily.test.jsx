import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
const { fetchFamily,sendFamilyCommand,familyCommand }=vi.hoisted(() => ({fetchFamily:vi.fn(),sendFamilyCommand:vi.fn(),familyCommand:vi.fn()}));
vi.mock('../../lib/family.js',() => ({fetchFamily,sendFamilyCommand,familyCommand}));
import { useFamily } from '../useFamily.js';
const snapshot=(id,title=id) => ({workspaceId:id,groups:[{id:'a',name:'A'},{id:'b',name:'B'}],tasks:[{title}],people:[],lists:[],events:[]});
beforeEach(() => {
 vi.clearAllMocks();fetchFamily.mockImplementation((id) => Promise.resolve(snapshot(id)));
 familyCommand.mockImplementation((w,a,p) => ({w,a,p,id:Math.random()}));sendFamilyCommand.mockResolvedValue({workspaceId:'a'});
});
describe('Family loading and writes',() => {
 it('does not display the previous family while a new family is loading',async () => {
  const {result}=renderHook(() => useFamily('a'));
  await waitFor(() => expect(result.current.data?.workspaceId).toBe('a'));
  let resolveB;fetchFamily.mockImplementation(() => new Promise((resolve) => {resolveB=resolve;}));
  act(() => result.current.setSelected('b'));
  expect(result.current.data).toBeNull();
  await act(async () => resolveB(snapshot('b')));
  expect(result.current.data.workspaceId).toBe('b');
 });
 it('ignores a late response from a previous family',async () => {
  let resolveA;fetchFamily.mockImplementation((id) => id==='a' ? new Promise((resolve) => {resolveA=resolve;}) : Promise.resolve(snapshot('b')));
  const {result}=renderHook(() => useFamily('a'));
  act(() => result.current.setSelected('b'));
  await waitFor(() => expect(result.current.data?.workspaceId).toBe('b'));
  await act(async () => resolveA(snapshot('a')));
  expect(result.current.data.workspaceId).toBe('b');
 });
 it('reuses a command ID after an ambiguous network failure',async () => {
  const {result}=renderHook(() => useFamily('a'));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  sendFamilyCommand.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({workspaceId:'a'});
  await act(async () => {await expect(result.current.run('list',{name:'Food'})).rejects.toThrow('network');});
  await act(async () => result.current.run('list',{name:'Food'}));
  expect(sendFamilyCommand.mock.calls[0][0]).toBe(sendFamilyCommand.mock.calls[1][0]);
  expect(familyCommand).toHaveBeenCalledOnce();
 });
 it('does not claim a saved change failed when the refresh fails',async () => {
  const {result}=renderHook(() => useFamily('a'));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  fetchFamily.mockRejectedValue(new Error('network'));
  await act(async () => {await expect(result.current.run('list',{name:'Food'})).resolves.toEqual({workspaceId:'a'});});
  expect(result.current.error).toBe(true);
 });
 it('clears records on access revocation',async () => {
  const {result}=renderHook(() => useFamily('a'));
  await waitFor(() => expect(result.current.data).toBeTruthy());
  fetchFamily.mockRejectedValue({code:'42501'});
  await act(async () => result.current.refresh());
  expect(result.current.data).toBeNull();
 });
});
