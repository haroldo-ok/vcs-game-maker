'use strict';

// Runs the fits of an audio import on several worker threads at once, one less than the machine has processors (at most six). The
// worker is public/js/sample-fit-worker.js, bundled by tools/samplefit/build.js. Where a worker can not be started the fits run on the
// page's thread, one after the other.

import {fitSample, fitTiaSample, fitBoth} from './sample-fit';

const MAX_WORKERS = 6;
const FITS = {dpc: fitSample, tia: fitTiaSample, both: fitBoth};

let workers = null;
let nextId = 0;
const queue = [];
const running = new Map();
// Whether the page's thread is doing a fit (used when there are no workers).
let mainBusy = false;

const startWorkers = () => {
  const count = Math.max(1, Math.min(MAX_WORKERS, (typeof navigator !== 'undefined' && navigator.hardwareConcurrency || 2) - 1));
  const started = [];
  try {
    for (let i = 0; i < count; i++) {
      const worker = new Worker('js/sample-fit-worker.js');
      const slot = {worker, task: null};
      worker.onmessage = ({data}) => handleMessage(slot, data);
      worker.onerror = (event) => {
        console.error('A sample fit worker failed, the fits run on the page instead', event.message, event.filename, event.lineno);
        abandonWorkers();
      };
      started.push(slot);
    }
  } catch (error) {
    started.forEach(({worker}) => worker.terminate());
    return [];
  }
  return started;
};

// A worker that fails (its script could not be loaded) ends the use of workers: what they were fitting starts again on this thread.
const abandonWorkers = () => {
  const lost = (workers || []).map((slot) => slot.task).filter(Boolean);
  (workers || []).forEach(({worker}) => worker.terminate());
  workers = [];
  lost.forEach((task) => {
    running.delete(task.id);
    queue.unshift(task);
  });
  pump();
};

const finish = (slot, task, settle) => {
  running.delete(task.id);
  if (slot) slot.task = null;
  settle();
  pump();
};

const handleMessage = (slot, data) => {
  const task = running.get(data.id);
  if (!task) return;
  if (data.started) {
    task.callbacks.onStart();
  } else if (data.progress !== undefined) {
    task.callbacks.onProgress(data.progress);
  } else if (data.error !== undefined) {
    finish(slot, task, () => task.reject(new Error(data.error)));
  } else {
    finish(slot, task, () => task.resolve(data.result));
  }
};

const runOnMainThread = async (task) => {
  mainBusy = true;
  task.callbacks.onStart();
  try {
    const result = await FITS[task.kind](task.prepared, {
      ...task.options,
      onProgress: ({fraction}) => task.callbacks.onProgress(fraction),
      isCancelled: task.callbacks.isCancelled,
    });
    task.resolve(result);
  } catch (error) {
    task.reject(error);
  }
  mainBusy = false;
  pump();
};

const pump = () => {
  if (workers === null) workers = startWorkers();
  while (queue.length) {
    if (workers.length) {
      const slot = workers.find((candidate) => !candidate.task);
      if (!slot) return;
      const task = queue.shift();
      slot.task = task;
      running.set(task.id, task);
      slot.worker.postMessage({id: task.id, kind: task.kind, prepared: task.prepared, options: task.options});
    } else {
      if (mainBusy) return;
      runOnMainThread(queue.shift());
    }
  }
};

// Fits a recording: kind is 'dpc', 'tia' or 'both', prepared what prepareSample made, options the fit's (mode, bars, timeScale).
// callbacks: onStart(), onProgress(0 to 1), isCancelled() (checked every little while). Resolves to the fit's result, or null when it was
// cancelled before it was done.
export const runFit = (kind, prepared, options, callbacks) => new Promise((resolve, reject) => {
  const task = {id: ++nextId, kind, prepared, options, callbacks, resolve, reject};
  queue.push(task);
  // A cancelled fit is told to stop, and one that has not started is dropped.
  const watch = setInterval(() => {
    if (!callbacks.isCancelled()) return;
    clearInterval(watch);
    const queued = queue.indexOf(task);
    if (queued >= 0) {
      queue.splice(queued, 1);
      resolve(null);
    } else if (workers && workers.some((slot) => slot.task === task)) {
      workers.find((slot) => slot.task === task).worker.postMessage({cancel: task.id});
    }
  }, 150);
  const done = () => clearInterval(watch);
  task.resolve = (value) => {
    done();
    resolve(value);
  };
  task.reject = (error) => {
    done();
    reject(error);
  };
  pump();
});
