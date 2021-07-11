/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating JavaScript for dynamic variable blocks.
 * @author fenichel@google.com (Rachel Fenichel)
 */
'use strict';

goog.provide('Blockly.BBasic.variablesDynamic');

goog.require('Blockly.BBasic');
goog.require('Blockly.BBasic.variables');


// JavaScript is dynamically typed.
Blockly.BBasic['variables_get_dynamic'] =
    Blockly.BBasic['variables_get'];
Blockly.BBasic['variables_set_dynamic'] =
    Blockly.BBasic['variables_set'];
