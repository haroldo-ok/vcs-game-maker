'use strict';

import {preprocessBatariBasic, compileBatariBasic, assembleDASM} from 'batari-basic/src/compiler';

// Attempts a full preprocess -> compile -> assemble pass over a candidate
// bBasic source, without throwing. This is the safe-execution primitive an
// automatic bank allocator needs: it can only know whether a given bank
// assignment fits by actually building it, so it must be able to try a
// candidate, fail, and try another without taking anything else down.
//
// Node scripts testing this same compiler earlier showed some malformed/
// oversized inputs cause a silent, uncatchable process termination - but that
// turned out to be specific to running it under Node. Re-tested directly in
// the browser (the environment this app actually runs in), every one of
// those same cases instead throws an ordinary, catchable exception with a
// normal error message. So a plain try/catch here is sufficient - no worker
// isolation or other defensive sandboxing is needed.
export const attemptBuild = (code) => {
  try {
    const preprocessed = preprocessBatariBasic(code);
    const assemblyFiles = compileBatariBasic(preprocessed);
    const compiledResult = assembleDASM(assemblyFiles);
    return {success: true, compiledResult};
  } catch (e) {
    return {success: false, error: e};
  }
};
