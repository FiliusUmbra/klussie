const PATHS = { today:'/app', discover:'/app/help', myHome:'/app/home', requests:'/app/requests', messages:'/app/messages', profile:'/app/account' };
export function customerDestination(pathname) {
  if (pathname === '/app/home/items') return { tab:'myHome', section:'myItems' };
  return { tab:Object.keys(PATHS).find((key) => PATHS[key] === pathname) || 'today', section:'myHome' };
}
export function customerPath(tab, section) {
  return tab === 'myHome' && section === 'myItems' ? '/app/home/items' : PATHS[tab] || PATHS.today;
}
