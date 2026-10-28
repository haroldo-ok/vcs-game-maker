import {onBeforeUnmount, watch} from '@vue/composition-api';

// watch(source, callback, {deep: true}) of @vue/composition-api adds a subscriber to the watched object that is never taken out again,
// and that subscriber holds the component: every visit to a tab that watched a project's data deeply left the whole tab behind (its
// DOM, its data), which added up until the page ran out of memory. This takes the subscriber out when the component is unmounted.
export const watchDeep = (source, callback, options = {}) => {
  const value = typeof source === 'function' ? source() : source && source.value;
  const dep = value && value.__ob__ && value.__ob__.dep;
  const before = dep ? dep.subs.slice() : [];
  const stop = watch(source, callback, {...options, deep: true});
  if (dep) {
    const added = dep.subs.filter((sub) => !before.includes(sub));
    onBeforeUnmount(() => added.forEach((sub) => dep.removeSub(sub)));
  }
  return stop;
};
