/* eslint-disable require-jsdoc */
(function() {
  const els = Array.prototype.filter.call(document.querySelectorAll('h2, p, figcaption, a.button'), function(e) {
    return !e.classList.contains('count');
  });
  const style = document.createElement('style');
  style.textContent = '[data-edit]{cursor:text}[data-edit]:hover{outline:1px dashed #ff8a3d;outline-offset:3px}[data-edit]:focus{outline:2px solid #ff8a3d;outline-offset:3px}' +
    '#edit-bar{position:fixed;top:4.25rem;right:.75rem;z-index:99;background:#1d2029;color:#e8eaf0;border:1px solid #ff8a3d;padding:.5rem .8rem;font:13px/1.4 system-ui,sans-serif;max-width:20rem}#edit-bar b{color:#ff8a3d}';
  document.head.appendChild(style);
  const bar = document.createElement('div');
  bar.id = 'edit-bar';
  bar.innerHTML = '<b>Editing.</b> Click any text and type. Changes save to the page file by themselves. Shift+Enter is a new line, Esc undoes. <div id="edit-status">Nothing changed yet.</div>';
  document.body.appendChild(bar);
  const status = document.getElementById('edit-status');
  function say(t) {
    status.textContent = t;
  }
  els.forEach(function(el, i) {
    let saved = el.innerHTML;
    el.setAttribute('data-edit', '');
    el.contentEditable = 'true';
    el.spellcheck = true;
    let timer = null;
    function save() {
      clearTimeout(timer);
      const html = el.innerHTML.replace(/(<br\s*\/?>)+$/i, '').trim();
      if (html === saved.trim()) return;
      say('Saving...');
      fetch('/__save', {method: 'POST', body: JSON.stringify({index: i, html: html})})
          .then(function(r) {
            return r.json();
          })
          .then(function(r) {
            if (r.ok) {
              saved = html; say('Saved at ' + new Date().toLocaleTimeString() + '.');
            } else {
              say('Could not save: ' + r.error);
            }
          })
          .catch(function() {
            say('Could not save: editing only works in the local preview.');
          });
    }
    el.addEventListener('input', function() {
      clearTimeout(timer); timer = setTimeout(save, 1000);
    });
    el.addEventListener('blur', save);
    el.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); el.blur();
      }
      if (e.key === 'Escape') {
        el.innerHTML = saved; el.blur();
      }
    });
    el.addEventListener('paste', function(e) {
      e.preventDefault();
      document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
    });
  });
  document.addEventListener('click', function(e) {
    if (e.target.closest('a')) e.preventDefault();
  }, true);
})();
