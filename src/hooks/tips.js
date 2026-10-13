import tipsData from '../data/tips.json';

// The tips shown when the app starts live in src/data/tips.json: each has its text and the wiki page it is about (and
// optionally a heading on that page, as "anchor"). A tip about more than one page lists the others in "also". Each
// one has a "page" and an optional "anchor". The wiki's address is at the top of the file. Edit that file to change them.
// Every start shows the next tip in the list, and the list comes round again after the last one.
const TIP_INDEX_KEY = 'vcs-game-maker.tipIndex';

// The icon of each wiki page's tab in the app's navigation bars, and the class that gives it that tab's color (see
// App.vue). The three pages that are not a tab (the graphic editor tools, the emulator pane and the console) get a
// plain icon in the title's color. The offset (in pixels) moves each icon down so that the middle of its drawing lines up
// with the middle of the title text; the icons' drawings sit a little differently in their boxes, so the offsets differ.
const TAB_ICONS = {
  'Actions': {icon: 'mdi-chart-scatter-plot', offset: 0.5, className: 'actions-item'},
  'Title': {icon: 'mdi-image-frame', offset: 0.5, className: 'titlescreen-item'},
  'Sprites': {icon: 'mdi-human-handsup', offset: 1.4, className: 'player-item'},
  'Background': {icon: 'mdi-map', offset: 0.7, className: 'background-item'},
  'Sound': {icon: 'mdi-waveform', offset: 0.6, className: 'sound-item'},
  'Music': {icon: 'mdi-music-note', offset: 0.7, className: 'music-item'},
  'Score': {icon: 'mdi-numeric', offset: 0.7, className: 'scorefont-item'},
  'Text': {icon: 'mdi-card-text-outline', offset: 0.7, className: 'text-tab-item'},
  'Data': {icon: 'mdi-table', offset: 0.7, className: 'data-item'},
  'Generated': {icon: 'mdi-card-text', offset: 0.7, className: 'generated-item'},
  'Options': {icon: 'mdi-cog', offset: 0.5, className: 'configuration-item'},
  'Project': {icon: 'mdi-pencil-ruler', offset: 0.6, className: 'project-item'},
  'About': {icon: 'mdi-information-outline', offset: 0.6, className: 'about-item'},
  'Graphic-Editor-Toolbar': {icon: 'mdi-pencil', offset: 0.7, className: ''},
  'Emulator': {icon: 'mdi-monitor', offset: 0.5, className: ''},
  'Console': {icon: 'mdi-console', offset: 0.7, className: ''},
};

const linkOf = ({page, anchor}) => ({
  url: `${tipsData.wiki}/${page}${anchor ? '#' + anchor : ''}`,
  label: page.replace(/-/g, ' '),
});

const tipAt = (index) => {
  const tips = tipsData.tips;
  // The next start carries on from the tip after this one.
  localStorage.setItem(TIP_INDEX_KEY, String((index + 1) % tips.length));
  const tip = tips[index];
  const pages = [tip, ...(tip.also || [])];
  // When one of the links is the Actions page it comes last.
  const links = [...pages.filter((link) => link.page !== 'Actions'), ...pages.filter((link) => link.page === 'Actions')];
  // The icon is the one of the tip's first page (not the Actions page that is listed last when there are several).
  return {index, text: tip.text, links: links.map(linkOf), tab: TAB_ICONS[tip.page] || {icon: 'mdi-help-circle-outline', offset: 0.6, className: ''}};
};

// The tip for this start.
export const nextTip = () => {
  const tips = tipsData.tips || [];
  if (!tips.length) return null;
  const stored = parseInt(localStorage.getItem(TIP_INDEX_KEY), 10);
  return tipAt(stored >= 0 ? stored % tips.length : 0);
};

// The tip before (step -1) or after (step 1) the one shown, going round at either end of the list.
export const tipNear = (tip, step) => {
  const count = tipsData.tips.length;
  return tipAt((((tip.index + step) % count) + count) % count);
};
