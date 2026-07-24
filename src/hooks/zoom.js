import {computed, ref} from '@vue/composition-api';

// Zoom is a per-tab view preference, so it is kept out of the project storage
// that gets saved and loaded with a project.
const keyOf = (name) => `vcs-game-maker.zoom.${name}`;

export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const DEFAULT_ZOOM = 1;

const clamp = (value) => {
  if (!Number.isFinite(value)) return DEFAULT_ZOOM;
  return Math.min(ZOOM_LEVELS[ZOOM_LEVELS.length - 1], Math.max(ZOOM_LEVELS[0], value));
};

// localStorage is not reactive, so reading it through a computed would cache
// the first value and never update the view. Each tab's zoom is held in a ref
// instead, seeded from storage once and written back on change. Keeping the
// refs here also means a tab keeps its zoom when it is revisited.
const zoomRefs = {};

const zoomRefFor = (name) => {
  if (!zoomRefs[name]) {
    zoomRefs[name] = ref(clamp(parseFloat(localStorage.getItem(keyOf(name)))));
  }
  return zoomRefs[name];
};

/**
 * Zoom factor for one editor tab, remembered between visits.
 * @param {string} name Identifies the tab, e.g. "player0".
 * @return {*} Writable computed holding the zoom factor.
 */
export const useEditorZoom = (name) => {
  const stored = zoomRefFor(name);
  return computed({
    get() {
      return stored.value;
    },
    set(value) {
      const zoom = clamp(value);
      stored.value = zoom;
      localStorage.setItem(keyOf(name), String(zoom));
    },
  });
};

/**
 * Steps to the next or previous zoom level.
 * @param {number} zoom Current zoom factor.
 * @param {number} direction 1 to zoom in, -1 to zoom out.
 * @return {number} The new zoom factor.
 */
export const stepZoom = (zoom, direction) => {
  const index = ZOOM_LEVELS.indexOf(zoom);
  if (index < 0) {
    // Not on a known level, so move to the nearest one in that direction.
    const next = direction > 0 ?
      ZOOM_LEVELS.find((level) => level > zoom) :
      ZOOM_LEVELS.slice().reverse().find((level) => level < zoom);
    return next === undefined ? zoom : next;
  }
  return ZOOM_LEVELS[Math.min(ZOOM_LEVELS.length - 1, Math.max(0, index + direction))];
};
