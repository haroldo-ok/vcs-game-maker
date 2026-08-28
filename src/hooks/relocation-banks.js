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

// A NARROWER exception to this file's own "never persisted" rule above -
// in-memory only (never written to configurationStorage/localStorage, so it
// never survives a reload and never gets saved with the project the way the
// old, reverted version did), and only ever used as a first-attempt HINT
// that rom.js's own retry loop immediately abandons in favor of a true
// from-scratch restart the moment it doesn't compile clean - never
// incrementally patched from. That sidesteps the exact failure mode the
// comment above documents (a stale assignment silently outliving the
// content that needed it, persisting confusingly across reloads/saves,
// heuristics drifting between saved sessions) while still skipping the
// relocation search entirely on the common case: rebuilding again shortly
// after a small edit, where last time's layout is very likely still exactly
// right. Keyed by romSize (like useRomCapacity's own cached measurement -
// see its comment in hooks/rom.js) since a layout found for one ROM size
// means nothing for another.
let lastSuccessfulBanks = null;
let lastSuccessfulRomSize = null;

// Called once, right after a build actually succeeds (see rom.js's own
// buildRom) - snapshots whatever layout got it there as next build's own
// first-attempt hint.
export const recordSuccessfulRelocationBanks = (romSize) => {
  lastSuccessfulBanks = banks;
  lastSuccessfulRomSize = romSize;
};

// Called once, right after resetRelocationBanks() at the top of a build -
// if a hint exists for this exact romSize, seeds `banks` with it (a plain
// reassignment, not a mutation of the stored snapshot itself - every
// setRelocationBank call after this still only ever produces NEW objects via
// its own spread, so the stored snapshot below is never at risk of being
// mutated out from under a later build that goes on to fail and re-record).
// Returns whether a hint was actually applied, so the caller can log it and
// know whether a full resetRelocationBanks() is needed if this first
// attempt doesn't pan out.
export const seedRelocationBanksFromLastSuccess = (romSize) => {
  if (!lastSuccessfulBanks || lastSuccessfulRomSize !== romSize) return false;
  banks = lastSuccessfulBanks;
  return true;
};
