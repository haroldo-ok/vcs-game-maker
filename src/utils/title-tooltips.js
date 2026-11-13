'use strict';

// The tooltips of the title="..." attributes: the browser draws those itself, on one line however long the text (which CSS can not
// change), so a long one ran off across the window. This shows the same text in a box that wraps instead: when the mouse comes over an
// element with a title, the title is taken off it (so the browser's tooltip does not show too) and put back when the mouse leaves; the box
// shows after a short wait, under the element at the mouse, or above it when there is no room below.

const SHOW_DELAY_MS = 500;
const GAP_PX = 8;

export const installTitleTooltips = () => {
  if (typeof document === 'undefined') return () => {};
  const box = document.createElement('div');
  box.className = 'app-title-tooltip';
  box.setAttribute('role', 'tooltip');
  box.style.display = 'none';
  document.body.appendChild(box);

  let target = null;
  let text = '';
  let timer = null;
  let mouseX = 0;

  // The title goes back on the element (Vue and the code that reads titles find it as it was).
  const hide = () => {
    clearTimeout(timer);
    timer = null;
    box.style.display = 'none';
    if (target && text && !target.hasAttribute('title')) target.setAttribute('title', text);
    target = null;
    text = '';
  };

  const show = () => {
    if (!target || !target.isConnected) return;
    box.textContent = text;
    box.style.display = 'block';
    const rect = target.getBoundingClientRect();
    const width = box.offsetWidth;
    const height = box.offsetHeight;
    const left = Math.max(GAP_PX, Math.min(window.innerWidth - width - GAP_PX, mouseX - width / 2));
    const below = rect.bottom + GAP_PX;
    const top = below + height <= window.innerHeight - GAP_PX ? below : Math.max(GAP_PX, rect.top - GAP_PX - height);
    box.style.left = `${Math.round(left)}px`;
    box.style.top = `${Math.round(top)}px`;
  };

  const onOver = (event) => {
    const element = event.target && event.target.closest ? event.target.closest('[title]') : null;
    if (!element || element === target) return;
    const title = element.getAttribute('title');
    hide();
    if (!title || !title.trim()) return;
    target = element;
    text = title;
    element.removeAttribute('title');
    mouseX = event.clientX;
    timer = setTimeout(show, SHOW_DELAY_MS);
  };
  const onMove = (event) => {
    if (target && box.style.display === 'none') mouseX = event.clientX;
  };
  const onOut = (event) => {
    if (target && !(event.relatedTarget && target.contains(event.relatedTarget))) hide();
  };

  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mouseout', onOut, true);
  document.addEventListener('mousedown', hide, true);
  document.addEventListener('keydown', hide, true);
  document.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
  return () => {
    hide();
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseout', onOut, true);
    document.removeEventListener('mousedown', hide, true);
    document.removeEventListener('keydown', hide, true);
    document.removeEventListener('scroll', hide, true);
    window.removeEventListener('blur', hide);
    box.remove();
  };
};
