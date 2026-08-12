'use strict';

// Which bank each relocatable unit (an event, a background/animation/player-
// default, a user-defined subroutine, or music) currently sits in, DURING
// THE BUILD IN PROGRESS ONLY - deliberately NOT persisted to localStorage
// the way the rest of the project's configuration is (see
// hooks/project.js's useConfigurationStorage). Every relocation decision is
// remade from scratch, starting with everything at bank 1, on every single
// build - see resetRelocationBanks, called once at the top of buildRom()
// (see hooks/rom.js).
//
// This used to live inside configurationStorage itself (graphicsBanks/
// eventBanks/musicBanks/subroutineBanks keys, persisted like every other
// project setting) so a bank assignment, once found, didn't need
// rediscovering on the next build. That persistence turned out to cause more
// confusion than it saved: a project that had ever needed music relocated
// kept carrying that assignment around - and the relocator's own "spread
// evenly"/"pack tight" heuristics changing between builds - even after the
// music was removed again, making failures look like they depended on
// history rather than the project's current actual content. A relocation
// decision is cheap to remake (a handful of retry attempts, see
// MAX_RELOCATION_ATTEMPTS in rom.js) and is always correct for exactly the
// project as it stands right now - there's no real cost to always starting
// fresh, only upside.
let banks = {graphicsBanks: {}, musicBanks: {}, subroutineBanks: {}, eventBanks: {}};

export const resetRelocationBanks = () => {
  banks = {graphicsBanks: {}, musicBanks: {}, subroutineBanks: {}, eventBanks: {}};
};

// Read-only snapshot for the generator's own bank-lookup functions
// (getEventBank/graphicsUnitBank/musicUnitBank/getSubroutineBank in
// generators/bbasic.js) and for surfacing in error diagnostics.
export const getRelocationBanks = () => banks;

// Records unitName (of the given kind - one of the four keys above) as
// relocated to bank. Called by rom.js's own retry loop as it works through
// relocation candidates for the build currently in progress.
export const setRelocationBank = (kind, unitName, bank) => {
  banks = {...banks, [kind]: {...banks[kind], [unitName]: bank}};
};
