// Parses an Aseprite "Export Sprite Sheet" JSON data file (hash or array
// "frames" mode - see https://www.aseprite.org/api/command/ExportSpriteSheet)
// into the handful of fields PlayerEditor.vue's Aseprite import actually
// needs: each frame's source rectangle in the strip image plus its real
// duration, and each frameTag (Aseprite's name for an animation clip) as an
// ordered list of indexes into that frame list.

// This app's compiled output is NTSC-only (see App.vue's gopher2600-wasm
// integration, pinned to NTSC to avoid a black-screen TV-spec bug), which
// runs at a fixed 60 frames/sec - frame.duration below (a per-frame counter
// compared against in generators/bbasic.js's processAnimation) counts real
// NTSC frames, not milliseconds.
const NTSC_FRAMES_PER_SECOND = 60;

// Aseprite stores each frame's duration in milliseconds; this app's
// frame.duration is a count of NTSC frames (see the module comment above).
// Rounds to the nearest frame, never below 1 - a 0-frame duration would
// make that pose invisible rather than just brief.
export const asepriteDurationToFrames = (ms) =>
  Math.max(1, Math.round((ms || 0) * NTSC_FRAMES_PER_SECOND / 1000));

// Expands one frameTag's [from, to] range into the actual play-order list of
// frame indexes, per Aseprite's four tag directions.
const frameIndexesForTag = (tag) => {
  const forward = [];
  for (let i = tag.from; i <= tag.to; i++) forward.push(i);
  const reversed = [...forward].reverse();
  switch (tag.direction) {
    case 'reverse':
      return reversed;
    // Plays the full range forward, then back to (but not including) both
    // ends, so the first/last pose isn't held for a doubled-up frame - the
    // same frame-count Aseprite's pingpong preview uses.
    case 'pingpong':
      return forward.concat(reversed.slice(1, -1));
    case 'pingpong_reverse':
      return reversed.concat(forward.slice(1, -1));
    case 'forward':
    default:
      return forward;
  }
};

// Throws a descriptive Error (shown via App.vue's errorStorage footer by
// the caller) rather than failing silently or with a cryptic JS error, since
// this is parsing a file the user hand-picked from disk, not app-internal
// data that's always expected to be well-formed.
export const parseAsepriteSheet = (json) => {
  if (!json || typeof json !== 'object' || !json.frames || !json.meta) {
    throw new Error('not a valid Aseprite sprite sheet JSON export (missing "frames"/"meta")');
  }

  const rawFrames = Array.isArray(json.frames) ? json.frames : Object.values(json.frames);
  if (!rawFrames.length) {
    throw new Error('the .json has no frames');
  }

  const frames = rawFrames.map((frame) => ({
    x: frame.frame.x,
    y: frame.frame.y,
    w: frame.frame.w,
    h: frame.frame.h,
    durationFrames: asepriteDurationToFrames(frame.duration),
  }));

  const tags = (json.meta.frameTags || []).map((tag) => ({
    name: tag.name,
    frameIndexes: frameIndexesForTag(tag),
  }));

  return {imageName: json.meta.image, frames, tags};
};
