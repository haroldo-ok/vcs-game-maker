'use strict';

// A Subroutine or Function block that nothing calls only costs ROM, and the variables its blocks use (a user variable only it touches, the
// result bytes of a collision block) take a slot for code that never runs. The build leaves them out: this takes them out of the project's
// XML before the code is made (the project on screen is not touched). A definition is kept when a "Call" block that is itself kept names
// it, so a subroutine only another unused subroutine calls goes too.

const DEFINITION_TYPES = ['subroutine_define', 'function_define'];
const CALL_TYPES = ['subroutine_call', 'function_call', 'function_call_statement'];

const childBlocks = (element, tag) => Array.from(element.children).filter((child) => child.nodeName === tag);

const nameOf = (block) => {
  const field = childBlocks(block, 'field').find((child) => child.getAttribute('name') === 'NAME');
  return field ? field.textContent : '';
};

// Takes the unused definitions out of the DOM of the workspace XML; returns the names that were left out.
export const removeUnusedDefinitions = (dom) => {
  const blocks = Array.from(dom.getElementsByTagName('block'));
  const definitions = blocks.filter((block) => DEFINITION_TYPES.includes(block.getAttribute('type')));
  if (!definitions.length) return [];
  const definitionSet = new Set(definitions);
  const insideDefinition = (block) => {
    for (let node = block.parentNode; node; node = node.parentNode) {
      if (definitionSet.has(node)) return node;
    }
    return null;
  };
  // The definitions each name stands for, and the names each definition calls (the calls anywhere in its body, nested ones included).
  const callsOf = new Map(definitions.map((definition) => [definition, new Set()]));
  const usedNames = new Set();
  blocks.filter((block) => CALL_TYPES.includes(block.getAttribute('type'))).forEach((block) => {
    const name = nameOf(block);
    let owner = insideDefinition(block);
    // A call inside a definition that sits inside another one counts for the outer one too.
    if (owner) {
      while (owner) {
        callsOf.get(owner).add(name);
        owner = insideDefinition(owner);
      }
    } else {
      usedNames.add(name);
    }
  });
  // A call whose name matches no definition falls back to one that is defined when the code is made (see subroutine_call's generator):
  // which one is not known here, so nothing is left out.
  const definedNames = new Set(definitions.map(nameOf));
  const allCallNames = new Set([...usedNames, ...[...callsOf.values()].flatMap((names) => [...names])]);
  if ([...allCallNames].some((name) => !definedNames.has(name))) return [];
  const keptDefinitions = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    definitions.forEach((definition) => {
      if (keptDefinitions.has(definition) || !usedNames.has(nameOf(definition))) return;
      keptDefinitions.add(definition);
      callsOf.get(definition).forEach((name) => {
        if (!usedNames.has(name)) {
          usedNames.add(name);
          changed = true;
        }
      });
      changed = true;
    });
  }
  const removed = [];
  definitions.filter((definition) => !keptDefinitions.has(definition)).forEach((definition) => {
    const parent = definition.parentNode;
    if (!parent) return;
    // The blocks that follow it in the stack take its place.
    const next = childBlocks(definition, 'next')[0];
    const following = next ? childBlocks(next, 'block')[0] : null;
    if (following) parent.insertBefore(following, definition);
    parent.removeChild(definition);
    removed.push(nameOf(definition));
  });
  return removed;
};
