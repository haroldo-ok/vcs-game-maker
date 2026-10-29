'use strict';

import Vue from 'vue';
import VueCompositionApi, {ref} from '@vue/composition-api';

Vue.use(VueCompositionApi);

// The variables of the last successful build: where each one lives in RAM, for the emulator's debug
// info. Kept in a module by itself, like rom-capacity.js, so the builder can set it without an import
// cycle. Each entry is {name, address, owner} with owner 'user', 'block' or 'system' (who asked for it).
const debugVariables = ref([]);

// Addresses from here are bytes of the DPC+ display memory (the emulator reads them from the cartridge, not the bus).
export const DISPLAY_RAM_BASE = 0x10000;
const DISPLAY_RAM_TABLES = ['PF1L', 'PF2L', 'PF1R', 'PF2R', 'PFCOLS', 'BKCOLS'];

export const useDebugVariables = () => debugVariables;

export const setDebugVariables = (value) => {
  debugVariables.value = value;
};

// The variable and the bit that say the Title Screen loop is running ({name, bit}, null when the project has no title screen), for the
// emulator's debug info.
const debugTitleLoop = ref(null);

export const useDebugTitleLoop = () => debugTitleLoop;

export const setDebugTitleLoop = (value) => {
  debugTitleLoop.value = value;
};

// The variables a build names (see computeVariableUsage in hooks/rom.js), with the address DASM gave each
// one. A variable that shares a slot with another (see titleSharedSlots in generators/bbasic.js) is listed
// too, under the name it has.
export const collectDebugVariables = (variableUsage, symbolmap) => {
  if (!variableUsage || !symbolmap) return [];
  const found = new Map();
  // A variable in a DPC+ bonus slot has no symbol named for it in the assembly (the slot, var0 and so on, is the symbol), so the slot's
  // symbol gives the address when the name has none.
  const add = (name, owner, sharing = {}, slot = null) => {
    const address = symbolmap[name] !== undefined ? symbolmap[name] : slot ? symbolmap[slot] : undefined;
    if (!name || found.has(name) || address === undefined) return;
    found.set(name, {name, address, owner, ...sharing});
  };
  // The DPC+ bonus slots (var0 to var8 and the bytes of the unused virtual sprites) hold variables too, like the shared byte
  // of the flag bits (a Boolean each).
  [...(variableUsage.letterAssignments || []), ...(variableUsage.superchipAssignments || []),
    ...(variableUsage.dpcPlusAssignments || [])].forEach((assignment) => {
    const owner = assignment.isUserVariable ? 'user' : 'block';
    const sharedWith = assignment.sharedWith || [];
    // The title screen names that live in this variable's slot while the title screen kernel runs.
    add(assignment.name, owner, sharedWith.length ? {sharedWith} : {}, assignment.slot);
    sharedWith.forEach((name) => add(name, 'block', {hostName: assignment.name}, assignment.slot));
  });
  (variableUsage.systemAssignments || []).forEach((assignment) => add(assignment.name, 'system'));
  // A variable kept in the DPC+ display memory is not in the 6507's address space: its address is DISPLAY_RAM_BASE plus its place in the
  // cartridge's 4K of display memory, which is where the table of its area starts (a symbol of the assembly; the last table does not start
  // on a page, the score digits come before it) and then 128 bytes in, plus the byte number.
  (variableUsage.displayRamAssignments || []).forEach((assignment) => {
    const table = DISPLAY_RAM_TABLES[assignment.area];
    const start = table && symbolmap[table] !== undefined ? symbolmap[table] & 0x0FFF : (6 + assignment.area) * 256;
    if (!assignment.name || found.has(assignment.name) || assignment.area === undefined) return;
    found.set(assignment.name, {name: assignment.name, address: DISPLAY_RAM_BASE + start + 128 + assignment.byte,
      owner: assignment.isUserVariable ? 'user' : 'block'});
  });
  // In memory address order, which is the order the debug overlay and its variable list show them in.
  return [...found.values()].sort((a, b) => a.address - b.address || a.name.localeCompare(b.name));
};
