'use strict';

// Fits a sound in a worker thread, so that the sounds of an import are fitted side by side and the page stays smooth (see
// utils/sample-fit-pool.js, which starts the workers and hands them the recordings).
//
// Messages in: {id, kind: 'dpc' | 'tia' | 'both', prepared, options} to start a fit, {cancel: id} to stop one.
// Messages out: {id, started: true}, {id, progress: 0 to 1} and finally {id, result} (null when it was cancelled) or {id, error}.

import {fitSample, fitTiaSample, fitBoth} from './sample-fit';

const FITS = {dpc: fitSample, tia: fitTiaSample, both: fitBoth};
const cancelled = new Set();

self.onmessage = async ({data}) => {
  if (data.cancel !== undefined) {
    cancelled.add(data.cancel);
    return;
  }
  const {id, kind, prepared, options} = data;
  self.postMessage({id, started: true});
  try {
    const result = await FITS[kind](prepared, {
      ...options,
      onProgress: ({fraction}) => self.postMessage({id, progress: fraction}),
      isCancelled: () => cancelled.has(id),
    });
    self.postMessage({id, result});
  } catch (error) {
    self.postMessage({id, error: error && error.message ? error.message : String(error)});
  }
  cancelled.delete(id);
};
