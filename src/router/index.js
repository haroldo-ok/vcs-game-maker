import Vue from 'vue';
import VueRouter from 'vue-router';
import Home from '../views/Home.vue';

Vue.use(VueRouter);

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home,
  },
  {
    path: '/about',
    name: 'About',
    // route level code-splitting
    // this generates a separate chunk (about.[hash].js) for this route
    // which is lazy-loaded when the route is visited.
    component: () => import(/* webpackChunkName: "about" */
        '../views/About.vue'),
  },
  {
    path: '/titlescreen',
    name: 'Title',
    component: () => import('../views/TitleScreenEditor.vue'),
  },
  {
    path: '/player',
    name: 'Sprites',
    component: () => import('../views/PlayerEditorView.vue'),
  },
  {
    path: '/background',
    name: 'Background',
    component: () => import('../views/BackgroundEditor.vue'),
  },
  {
    path: '/soundfx',
    name: 'SoundFX',
    component: () => import('../views/SoundFXEditor.vue'),
  },
  {
    path: '/music',
    name: 'Music',
    component: () => import('../views/MusicEditor.vue'),
  },
  {
    path: '/scorefont',
    name: 'Score',
    component: () => import('../views/ScoreFontEditor.vue'),
  },
  {
    path: '/text',
    name: 'Text',
    component: () => import('../views/TextEditor.vue'),
  },
  {
    path: '/data',
    name: 'Data',
    component: () => import('../views/DataEditor.vue'),
  },
  {
    path: '/configuration',
    name: 'Options',
    component: () => import('../views/Configuration.vue'),
  },
  {
    path: '/generated',
    name: 'Generated',
    component: () => import('../views/GeneratedCode.vue'),
  },
  {
    path: '/project',
    name: 'Project',
    component: () => import('../views/Project.vue'),
  },
];

const router = new VueRouter({
  routes,
});

export default router;
