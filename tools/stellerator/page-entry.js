'use strict';

// The page's side of the 6502.ts backend: the WebGL video driver that comes with 6502.ts, which
// provides the screen effects (TV signal filter, phosphor glow, scanlines, gamma, quasi-integer
// scaling).
// The driver draws into an off-screen canvas; public/index.html copies that onto the visible
// canvas after each draw, so the visible canvas keeps one 2D context for both emulator backends.
//
// Exposes window.StelleratorVideo. Build: `npm run build:stellerator` (tools/stellerator/build.js).

const Video = require('6502.ts/lib/web/driver/Video').default;
const {Event} = require('microevent.ts');

// Effects apply when the driver is created, so a change builds a fresh driver.
const create = (config) => {
  const canvas = document.createElement('canvas');
  const newFrame = new Event();
  const endpoint = {
    width: 160,
    height: 212,
    getWidth() {
      return this.width;
    },
    getHeight() {
      return this.height;
    },
    newFrame,
  };
  const video = new Video(canvas, config).init();
  video.bind(endpoint);
  let closed = false;

  return {
    canvas,
    // pixels: an ArrayBuffer of width * height RGBA pixels.
    push(width, height, pixels) {
      if (closed) return;
      if (width !== endpoint.width || height !== endpoint.height) {
        endpoint.width = width;
        endpoint.height = height;
        video.unbind();
        video.bind(endpoint);
      }
      const data = new ImageData(new Uint8ClampedArray(pixels), width, height);
      newFrame.dispatch({get: () => data, adopt() {}, release() {}, dispose() {}});
    },
    // Size in CSS pixels; the driver multiplies by the device pixel ratio.
    resize(width, height) {
      if (!closed) video.resize(width, height);
    },
    close() {
      closed = true;
      video.close();
    },
  };
};

window.StelleratorVideo = {create};
