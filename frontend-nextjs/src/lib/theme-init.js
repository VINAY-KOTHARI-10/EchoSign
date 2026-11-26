// Runs before the page is painted (inlined in <head> by the layout): applies the saved or system light/dark theme.
// It reads the same saved preferences ("lw_ui_prefs") as the EchoSign accessibility settings, so the public pages and the
// signed-in screens always agree.
export const themeInitScript = `try{var p=JSON.parse(localStorage.getItem('lw_ui_prefs')||'{}');var t=p.theme&&p.theme!=='system'?p.theme:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var d=document.documentElement;d.setAttribute('data-theme',t);d.style.colorScheme=t;if(p.highContrast)d.setAttribute('data-contrast','high');if(p.reduceMotion)d.setAttribute('data-motion','reduce')}catch(e){document.documentElement.setAttribute('data-theme','light')}`;
