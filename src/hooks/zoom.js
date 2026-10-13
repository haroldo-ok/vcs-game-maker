import {computed, ref} from '@vue/composition-api';

// Zoom is a per-tab view preference, so it is kept out of the project storage
// that gets saved and loaded with a project.
const keyOf = (name) => `vcs-game-maker.zoom.${name}`;

export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const DEFAULT_ZOOM = 1;

const clamp = (value, fallback = DEFAULT_ZOOM, levels = ZOOM_LEVELS) => {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(levels[levels.length - 1], Math.max(levels[0], value));
};

// localStorage is not reactive, so reading it through a computed would cache
// the first value and never update the view. Each tab's zoom is held in a ref
// instead, seeded from storage once and written back on change. Keeping the
// refs here also means a tab keeps its zoom when it is revisited.
const zoomRefs = {};

const zoomRefFor = (name, defaultZoom, levels) => {
  if (!zoomRefs[name]) {
    zoomRefs[name] = ref(clamp(parseFloat(localStorage.getItem(keyOf(name))), defaultZoom, levels));
  }
  return zoomRefs[name];
};

/**
 * Zoom factor for one editor tab, remembered between visits.
 * @param {string} name Identifies the tab, e.g. "player0".
 * @param {number} [defaultZoom] Zoom to start at before the tab has ever
 *   been visited/zoomed - the Text tab's glyphs (200%, see
 *   TextFontEditor.vue) and the Score tab's digits (150%, see
 *   ScoreFontEditor.vue) read better zoomed in further by default, and the
 *   Sprites tab (75%, see PlayerEditor.vue) the other direction, all
 *   differing from every other tab's shared 100%.
 * @param {number[]} [levels] Stops to clamp/step between - defaults to the
 *   shared ZOOM_LEVELS. Only the Title tab overrides this (see
 *   TitleScreenEditor.vue's TITLESCREEN_ZOOM_LEVELS), whose wide 96px-tall
 *   cards can need to zoom out further than every other tab's graphics
 *   ever do.
 * @return {*} Writable computed holding the zoom factor.
 */
export const useEditorZoom = (name, defaultZoom = DEFAULT_ZOOM, levels = ZOOM_LEVELS) => {
  const stored = zoomRefFor(name, defaultZoom, levels);
  return computed({
    get() {
      return stored.value;
    },
    set(value) {
      const zoom = clamp(value, defaultZoom, levels);
      stored.value = zoom;
      localStorage.setItem(keyOf(name), String(zoom));
    },
  });
};

/**
 * Steps to the next or previous zoom level.
 * @param {number} zoom Current zoom factor.
 * @param {number} direction 1 to zoom in, -1 to zoom out.
 * @param {number[]} [levels] Stops to step between - defaults to the shared
 *   ZOOM_LEVELS (see useEditorZoom's param of the same name).
 * @return {number} The new zoom factor.
 */
export const stepZoom = (zoom, direction, levels = ZOOM_LEVELS) => {
  const index = levels.indexOf(zoom);
  if (index < 0) {
    // Not on a known level, so move to the nearest one in that direction.
    const next = direction > 0 ?
      levels.find((level) => level > zoom) :
      levels.slice().reverse().find((level) => level < zoom);
    return next === undefined ? zoom : next;
  }
  return levels[Math.min(levels.length - 1, Math.max(0, index + direction))];
};
