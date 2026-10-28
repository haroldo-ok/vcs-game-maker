// Local preview of the web page (the site folder) with a text edit mode: run "npm run site:edit", open http://127.0.0.1:8771/ and click any
// text to change it (add ?view to the address to see the page without the edit mode). Each change is written straight into site/index.html (and logged in site_edits.log next to this file), so nothing has to be
// downloaded. The page on the web has none of this.
const http = require('http'); const fs = require('fs'); const path = require('path');
const SITE = path.resolve(__dirname, '../../site');
const LOG = path.join(__dirname, 'site_edits.log');
const TYPES = {'.html': 'text/html; charset=utf-8', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.js': 'text/javascript', '.png': 'image/png'};
const EDITOR = fs.readFileSync(path.join(__dirname, 'editor.js'), 'utf8');

// The editable elements of the source, in document order: the same list the editor builds in the browser.
const editables = (html) => {
  const start = html.indexOf('<body');
  const end = html.indexOf('<script', start);
  const body = html.slice(start, end < 0 ? html.length : end);
  const found = [];
  const re = /<(h2|p|figcaption|a)\b([^>]*)>([\s\S]*?)<\/\1>/g;
  let m;
  while ((m = re.exec(body))) {
    const attrs = m[2];
    const cls = (/class="([^"]*)"/.exec(attrs) || [])[1] || '';
    const tokens = cls.split(/\s+/);
    if (m[1] === 'a' && !tokens.includes('button')) continue;
    if (tokens.includes('count')) continue;
    found.push({from: start + m.index + m[0].indexOf('>') + 1, to: start + m.index + m[0].length - ('</' + m[1] + '>').length});
  }
  return found;
};

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'POST' && url.pathname === '/__save') {
    let data = '';
    req.on('data', (c) => data += c);
    req.on('end', () => {
      try {
        const {index, html} = JSON.parse(data);
        const file = path.join(SITE, 'index.html');
        const source = fs.readFileSync(file, 'utf8');
        const spot = editables(source)[index];
        if (!spot) throw new Error('no such text: ' + index);
        const before = source.slice(spot.from, spot.to);
        if (before === html) {
          res.end('{"ok":true,"same":true}'); return;
        }
        fs.writeFileSync(file, source.slice(0, spot.from) + html + source.slice(spot.to));
        fs.appendFileSync(LOG, `${new Date().toISOString()} #${index}\n- ${before.replace(/\s+/g, ' ').trim()}\n+ ${html.replace(/\s+/g, ' ').trim()}\n`);
        res.end('{"ok":true}');
      } catch (e) {
        res.statusCode = 500;
        res.end(JSON.stringify({ok: false, error: String(e.message || e)}));
      }
    });
    return;
  }
  let name = decodeURIComponent(url.pathname);
  if (name === '/') name = '/index.html';
  const file = path.join(SITE, name);
  if (!file.startsWith(SITE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404; res.end('not found'); return;
  }
  let body = fs.readFileSync(file);
  if (name === '/index.html' && !url.searchParams.has('view')) {
    body = Buffer.from(body.toString('utf8').replace('</body>', '<script>' + EDITOR + '</script></body>'));
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}).listen(8771, '127.0.0.1', () => console.log('listening 8771'));
