'use strict';

// Registers every block definition as a side effect. Imported wherever a
// workspace has to be built from stored XML (the editor, and the on-demand ROM
// builder), so the same set is always available regardless of which one loads
// first.
import './prompt-fix';
import './trashcan-size';

import './background';
import './bit';
import './collision';
import './color';
import './data';
import './event';
import './input';
import './loops';
import './math';
import './music';
import './random';
import './score';
import './sound';
import './soundfx';
import './sprites';
import './subroutine';
import './text-minikernel';
