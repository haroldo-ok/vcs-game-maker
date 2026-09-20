'use strict';

// The Titlescreen Kernel's own static drawing code (see public/bb19/
// titlescreen/) - the fixed, cycle-exact assembly adapted from Mike
// Saarna's "bB Titlescreen Kernel" 1.8. Fetched once and cached, same
// "hooks/rom.js places these as siblings of the compiled source" reasoning
// as text-minikernel-files.js's own getTextMinikernelSiblingFiles - only
// the files actually needed for whichever bitmap kernel copies (1-8, per
// type) the current project uses are included, so an unused kernel/copy
// costs nothing to fetch either.
const fetchText = (path) => fetch(path).then((r) => r.text());

// titlescreen_kernel.asm/titlescreen_color.asm are no longer fetched here -
// registerTitleScreenSubroutine (generators/bbasic/titlescreen.js) now
// generates that driver/color content directly in JS, one shared copy for
// every title screen page in the project instead of one static, single-
// page file (see its own comment for why: a per-copy kernel file like
// 48x1_1_kernel.asm reaches shared routines like position48 via a plain
// same-bank "jsr", so every page has to compile into the SAME subroutine/
// bank rather than each getting its own).
let staticFilesPromise = null;
const STATIC_FILES = [
  'layoutmacros.asm', 'dpcfix.asm', 'position48.asm', 'player_kernel.asm', 'score_kernel.asm',
];
const getStaticFiles = () => {
  if (!staticFilesPromise) {
    staticFilesPromise = Promise.all(STATIC_FILES.map((name) =>
      fetchText(`bb19/titlescreen/${name}`).then((text) => [name, text])));
  }
  return staticFilesPromise;
};

const kernelFileCache = new Map();
const getKernelFile = (name) => {
  if (!kernelFileCache.has(name)) {
    kernelFileCache.set(name, fetchText(`bb19/titlescreen/${name}`));
  }
  return kernelFileCache.get(name);
};

/**
 * Fetches every sibling .asm file the Titlescreen Kernel needs for the
 * given set of "type_slot" kernel copies actually in use (e.g. "48x1_1",
 * "96x2_3") - the fixed files every project needs, plus only the specific
 * per-copy kernel files (48x1_N_kernel.asm/48x2_N_kernel.asm/
 * 96x2_N_kernel.asm) actually referenced, plus the shared 48x1_X_kernel.asm/
 * 48x2_X_kernel.asm core whenever any 48x1/48x2 copy is used at all (see
 * public/bb19/titlescreen/titlescreen_kernel.asm's own #ifconst gates,
 * mirrored here so an unused copy's kernel file is never even fetched).
 * @param {Set<string>} usedKernelKeys e.g. new Set(['48x1_1', '96x2_3']).
 * @return {Promise<Object<string, string>>} filename -> file content.
 */
export const getTitleScreenSiblingFiles = async (usedKernelKeys) => {
  const staticEntries = await getStaticFiles();
  const files = Object.fromEntries(staticEntries);

  const perCopyNames = new Set();
  usedKernelKeys.forEach((key) => {
    perCopyNames.add(`${key}_kernel.asm`);
    if (key.startsWith('48x1_')) perCopyNames.add('48x1_X_kernel.asm');
    if (key.startsWith('48x2_')) perCopyNames.add('48x2_X_kernel.asm');
  });

  const perCopyEntries = await Promise.all(
      [...perCopyNames].map((name) => getKernelFile(name).then((text) => [name, text])));
  perCopyEntries.forEach(([name, text]) => {
    files[name] = text;
  });

  return files;
};
