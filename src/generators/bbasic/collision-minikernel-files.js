'use strict';

// The box-collision minikernel's own collision_undo.asm. Fetched once and
// cached; hooks/rom.js places this as a sibling of the compiled source
// throughout the whole compile pipeline (see compileBatariBasicToAsm in
// hooks/bb-compiler.js), the same relationship it'd have as a real file next
// to a .bas file on disk - same convention as text-minikernel-files.js's own
// text12a.asm/text12b.asm, confirmed working there for exactly the same
// "inline X.asm" requirement.
const fetchText = (path) => fetch(path).then((r) => r.text());

let filesPromise = null;
export const getCollisionMinikernelSiblingFiles = () => {
  if (!filesPromise) {
    filesPromise = fetchText('bb19/collision-minikernel/collision_undo.asm')
        .then((collisionUndo) => ({'collision_undo.asm': collisionUndo}));
  }
  return filesPromise;
};
