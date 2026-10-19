import pkg from '../../package.json';

// The version of the app that writes a project, sound, sound bank, song or title screen file (package.json's version). Informational: it says which
// release made the file, and the example and sound bank downloads left out of the list are the ones a newer app made.
export const APP_VERSION = pkg.version;
export const APP_VERSION_KEY = 'app-version';

// The field every exported file carries.
export const appVersionField = () => ({[APP_VERSION_KEY]: APP_VERSION});

const parts = (version) => String(version || '').split('.').map((part) => parseInt(part, 10) || 0);

// Negative when the first version is older than the second, 0 when they are the same, positive when it is newer ("0.52.27" and "0.52.3": 27 > 3).
export const compareVersions = (first, second) => {
  const a = parts(first);
  const b = parts(second);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] || 0) - (b[i] || 0);
    if (difference) return difference;
  }
  return 0;
};

// True for a file written by a version of the app newer than this one. A file with no version (saved before it was recorded) is not.
export const isFromNewerApp = (version, current = APP_VERSION) => !!version && compareVersions(version, current) > 0;
