/* eslint-disable no-console */

import {register} from 'register-service-worker';

// Service workers require http(s) - the desktop (Electron) build loads
// index.html via file://, where navigator.serviceWorker either doesn't exist
// or registration just fails, so this only runs for the actual web build.
if (process.env.NODE_ENV === 'production' && /^https?:$/.test(window.location.protocol)) {
  register(`${process.env.BASE_URL}service-worker.js`, {
    ready() {
      console.log(
          'App is being served from cache by a service worker.\n' +
        'For more details, visit https://goo.gl/AFskqB');
    },
    registered() {
      console.log('Service worker has been registered.');
    },
    cached() {
      console.log('Content has been cached for offline use.');
    },
    updatefound() {
      console.log('New content is downloading.');
    },
    updated() {
      console.log('New content is available; please refresh.');
    },
    offline() {
      console.log('No internet connection found. App is running in offline mode.');
    },
    error(error) {
      console.error('Error during service worker registration:', error);
    },
  });
}
