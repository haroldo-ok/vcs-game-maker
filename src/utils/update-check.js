// The desktop app asks GitHub for the newest release and tells the user when it is newer than the running version, with a link that
// downloads the file made for the system the app runs on. The release files are named by the build workflow
// (.github/workflows/build.yml): VCS-Game-Maker-<version>-Windows-Setup.msi, -Windows-arm64-Setup.msi, -macOS-arm64.dmg,
// -macOS-x64.dmg, -Linux-amd64.deb, -Linux-arm64.deb, -Linux-x64.AppImage.tar.gz, -Linux-arm64.AppImage.tar.gz,
// -Linux-x86_64.rpm, -Linux-x64-VCS-portable.tar.gz and -Web.zip.

export const RELEASES_API_URL = 'https://api.github.com/repos/AbstractPolygon/vcs-game-maker-absply/releases/latest';
export const RELEASES_PAGE_URL = 'https://github.com/AbstractPolygon/vcs-game-maker-absply/releases/latest';

// 1 when a is the newer version, -1 when b is, 0 when they are the same. A leading "v" and anything after a dash are ignored.
export const compareVersions = (a, b) => {
  const parts = (version) => String(version).replace(/^v/i, '').split('-')[0].split('.').map((part) => Number(part) || 0);
  const left = parts(a);
  const right = parts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference) return difference > 0 ? 1 : -1;
  }
  return 0;
};

// The end of the name of the file to download, in the order to try, for a system: process.platform ('win32', 'darwin', 'linux') and
// process.arch ('x64', 'arm64'). Linux gets the AppImage (it runs on any distribution), then the package of the usual kind.
export const downloadSuffixes = (platform, arch) => {
  const arm = arch === 'arm64';
  if (platform === 'win32') return [arm ? '-Windows-arm64-Setup.msi' : '-Windows-Setup.msi'];
  if (platform === 'darwin') return [arm ? '-macOS-arm64.dmg' : '-macOS-x64.dmg'];
  if (platform === 'linux') {
    return arm ? ['-Linux-arm64.AppImage.tar.gz', '-Linux-arm64.deb'] :
      ['-Linux-x64.AppImage.tar.gz', '-Linux-amd64.deb', '-Linux-x86_64.rpm'];
  }
  return [];
};

// The file of a release for a system, or null when the release has none.
export const pickDownload = (release, platform, arch) => {
  const assets = (release && release.assets) || [];
  for (const suffix of downloadSuffixes(platform, arch)) {
    const asset = assets.find((candidate) => candidate.name.endsWith(suffix));
    if (asset) return asset;
  }
  return null;
};

// A readable name of the system for the notice.
export const systemName = (platform, arch) => {
  const os = {win32: 'Windows', darwin: 'macOS', linux: 'Linux'}[platform] || platform;
  return `${os} (${arch === 'arm64' ? 'ARM' : 'Intel/AMD'})`;
};

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
// Headline case: each word starts with a capital, except the small ones in the middle; words that already have a capital stay as they are.
const headlineCase = (text) => text.split(' ').map((word, i) =>
  (i > 0 && SMALL_WORDS.has(word) ? word : word.replace(/^([a-z])/, (letter) => letter.toUpperCase()))).join(' ');

// The text of a release (GitHub's markdown) as HTML for the notice: headings, bold, italic, code, links (https only), bullet and
// numbered lists, paragraphs. Everything is escaped first, so nothing in the notes can add markup of its own.
export const renderReleaseNotes = (markdown) => {
  const inline = (raw) => escapeHtml(raw)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, (m, a, b) => `<strong>${a || b}</strong>`)
      .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\*)/g, '$1<em>$2</em>')
      .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const out = [];
  let list = null;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  String(markdown || '').replace(/\r\n/g, '\n').split('\n').forEach((line) => {
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    const item = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
    if (item) {
      const kind = /\d/.test(item[1]) ? 'ol' : 'ul';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline(item[2])}</li>`);
      return;
    }
    closeList();
    if (heading) out.push(`<div class="notes-heading">${inline(headlineCase(heading[2]))}</div>`);
    else if (line.trim()) out.push(`<p>${inline(line.trim())}</p>`);
  });
  closeList();
  return out.join('');
};

// Looks at the newest release. fetchRelease (for tests) gives the release the way GitHub's API does. Gives null when the running
// version is the newest (or the check could not be made), else {version, downloadUrl, fileName, size, releaseUrl, system}.
export const checkForUpdate = async ({currentVersion, platform, arch, fetchRelease}) => {
  try {
    const release = fetchRelease ? await fetchRelease() :
      await fetch(RELEASES_API_URL, {headers: {Accept: 'application/vnd.github+json'}}).then((response) => {
        if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
        return response.json();
      });
    const version = String(release.tag_name || '').replace(/^v/i, '');
    if (!version || compareVersions(version, currentVersion) <= 0) return null;
    const asset = pickDownload(release, platform, arch);
    return {
      version,
      downloadUrl: asset ? asset.browser_download_url : null,
      fileName: asset ? asset.name : null,
      size: asset ? asset.size : null,
      releaseUrl: release.html_url || RELEASES_PAGE_URL,
      notes: String(release.body || '').replace(/\r\n/g, '\n').trim(),
      system: systemName(platform, arch),
    };
  } catch (e) {
    // No network, a rate limit, a page that changed: nothing to tell the user about.
    return null;
  }
};
