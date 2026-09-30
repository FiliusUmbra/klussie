// Calendar dates deliberately stay local: a holiday is not a UTC timestamp.
export function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function monthDays(month) {
  const start = new Date(`${month}-01T12:00:00`);
  const offset = (start.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start); day.setDate(1 - offset + i);
    return { date: dateKey(day), day: day.getDate(), current: day.getMonth() === start.getMonth() };
  });
}
export function shiftMonth(month, delta) {
  const day = new Date(`${month}-01T12:00:00`);
  day.setMonth(day.getMonth() + delta);
  return dateKey(day).slice(0, 7);
}
export function eventsOn(events, date) {
  return events.filter((event) => event.starts_on <= date && event.ends_on >= date);
}
export function todayTasks(tasks, today) {
  return tasks.filter((task) => !task.completed_at && task.due_on && task.due_on <= today);
}
export function familyErrorKey(error) {
  if (error?.message?.includes('family_conflict')) return 'conflict';
  if (error?.message?.includes('family_invalid_invite')) return 'invalidInvite';
  if (error?.message?.includes('family_already_member')) return 'alreadyMember';
  return 'saveFailed';
}
