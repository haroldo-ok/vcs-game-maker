'use strict';

import Vue from 'vue';
import VueCompositionApi, {ref} from '@vue/composition-api';

Vue.use(VueCompositionApi);

// The variables of the last successful build: where each one lives in RAM, for the emulator's debug
// info. Kept in a module by itself, like rom-capacity.js, so the builder can set it without an import
// cycle. Each entry is {name, address, owner} with owner 'user', 'block' or 'system' (who asked for it).
const debugVariables = ref([]);

export const useDebugVariables = () => debugVariables;

export const setDebugVariables = (value) => {
  debugVariables.value = value;
};

// The variables a build names (see computeVariableUsage in hooks/rom.js), with the address DASM gave each
// one. A variable that shares a slot with another (see titleSharedSlots in generators/bbasic.js) is listed
// too, under the name it has.
export const collectDebugVariables = (variableUsage, symbolmap) => {
  if (!variableUsage || !symbolmap) return [];
  const found = new Map();
  const add = (name, owner, sharing = {}) => {
    if (!name || found.has(name) || symbolmap[name] === undefined) return;
    found.set(name, {name, address: symbolmap[name], owner, ...sharing});
  };
  // The DPC+ bonus slots (var0 to var8 and the bytes of the unused virtual sprites) hold variables too, like the shared byte
  // of the flag bits (a Boolean each).
  [...(variableUsage.letterAssignments || []), ...(variableUsage.superchipAssignments || []),
    ...(variableUsage.dpcPlusAssignments || [])].forEach((assignment) => {
    const owner = assignment.isUserVariable ? 'user' : 'block';
    const sharedWith = assignment.sharedWith || [];
    // The title screen names that live in this variable's slot while the title screen kernel runs.
    add(assignment.name, owner, sharedWith.length ? {sharedWith} : {});
    sharedWith.forEach((name) => add(name, 'block', {hostName: assignment.name}));
  });
  (variableUsage.systemAssignments || []).forEach((assignment) => add(assignment.name, 'system'));
  // Superchip RAM's read/write pool: a variable there is only known in the assembly by its read address (r000).
  (variableUsage.superchipRwAssignments || []).forEach((assignment) => {
    const readSlot = String(assignment.slot || '').split('/')[0];
    if (!assignment.name || found.has(assignment.name) || symbolmap[readSlot] === undefined) return;
    found.set(assignment.name, {name: assignment.name, address: symbolmap[readSlot], owner: 'block'});
  });
  // In memory address order, which is the order the debug overlay and its variable list show them in.
  return [...found.values()].sort((a, b) => a.address - b.address || a.name.localeCompare(b.name));
};
