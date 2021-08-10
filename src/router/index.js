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
    path: '/player0',
    name: 'Player 0',
    component: () => import('../views/Player0Editor.vue'),
  },
  {
    path: '/player1',
    name: 'Player 1',
    component: () => import('../views/Player1Editor.vue'),
  },
  {
    path: '/background',
    name: 'Background',
    component: () => import('../views/BackgroundEditor.vue'),
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
