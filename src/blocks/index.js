'use strict';

// Registers every block definition as a side effect. Imported wherever a
// workspace has to be built from stored XML (the editor, and the on-demand ROM
// builder), so the same set is always available regardless of which one loads
// first.
import './prompt-fix';

import './background';
import './bit';
import './collision';
import './color';
import './event';
import './input';
import './loops';
import './math';
import './random';
import './score';
import './sound';
import './sprites';
