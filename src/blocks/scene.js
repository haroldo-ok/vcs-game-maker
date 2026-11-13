'use strict';

import * as Blockly from 'blockly/core';

import {useDataTablesStorage, useConfigurationStorage} from '../hooks/project';
import {playerCount} from '../utils/pxe';
import {processDataTablesStorageDefaults} from './data';
import {decodeScene, isSceneTable} from '../utils/scene';
import {SCENE_ICON} from './icon';

const SCENE_COLOR = 'rgb(0, 137, 123)';

// The scenes are the Data cards that the Scene tab makes; read afresh each time the dropdown opens so new, renamed and deleted ones show.
export const buildSceneOptions = () => {
  try {
    const data = processDataTablesStorageDefaults(useDataTablesStorage());
    const scenes = data.dataTables.filter(isSceneTable);
    if (!scenes.length) return [['(no scenes yet)', '0']];
    return scenes.map(({id, name}) => [name || `Unnamed ${id}`, `${id}`]);
  } catch (e) {
    console.error('Failed to list scene options', e);
    return [['Error', '0']];
  }
};

// The generator never sees these two: they are replaced by the blocks of the scene when the project is built (utils/scene.js).
Blockly.Blocks['scene_set'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${SCENE_ICON} Set scene`)
        .appendField(new Blockly.FieldDropdown(buildSceneOptions), 'SCENE');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SCENE_COLOR);
    this.setTooltip('Sets up the background and the sprites of a scene made on the Scene tab.');
  },
};

Blockly.Blocks['scene_set_by_id'] = {
  init: function() {
    this.appendValueInput('ID')
        .setCheck('Number')
        .appendField(`${SCENE_ICON} Set scene by ID`);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SCENE_COLOR);
    this.setTooltip('Sets up a scene made on the Scene tab by its ID, the ID of its card on the Data tab.');
  },
};

// The triggers of the scenes (see utils/scene.js and generators/bbasic/triggers.js). The first three are put in the project when it is built, and
// are never shown; the others are the ones a project uses. A trigger belongs to a scene, but the blocks work for the scene that is showing.
Blockly.Blocks['scene_mark'] = {
  init: function() {
    this.appendDummyInput().appendField('scene shown').appendField(new Blockly.FieldNumber(0, 0, 255, 1), 'SCENE');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SCENE_COLOR);
  },
};

// The blocks inside run only while the scene with this ID is the one showing (the offset areas of the scenes use it).
Blockly.Blocks['scene_active_if'] = {
  init: function() {
    this.appendDummyInput().appendField('while scene').appendField(new Blockly.FieldNumber(0, 0, 255, 1), 'SCENE').appendField('is showing');
    this.appendStatementInput('DO');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SCENE_COLOR);
  },
};

Blockly.Blocks['trigger_clear'] = {
  init: function() {
    this.appendDummyInput().appendField('triggers: new frame');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SCENE_COLOR);
  },
};

Blockly.Blocks['trigger_check'] = {
  init: function() {
    this.appendDummyInput()
        .appendField('trigger')
        .appendField(new Blockly.FieldTextInput(''), 'KEY')
        .appendField(new Blockly.FieldTextInput(''), 'NAME')
        .appendField(new Blockly.FieldNumber(0, 0, 255, 1), 'SCENE')
        .appendField(new Blockly.FieldTextInput('player0'), 'SPRITES')
        .appendField(new Blockly.FieldNumber(0, 0, 255, 1), 'LEFT')
        .appendField(new Blockly.FieldNumber(0, 0, 255, 1), 'TOP')
        .appendField(new Blockly.FieldNumber(1, 1, 255, 1), 'WIDTH')
        .appendField(new Blockly.FieldNumber(1, 1, 255, 1), 'HEIGHT');
    // What the trigger calls when it fires (the Subroutine or the Function its card names).
    this.appendStatementInput('DO');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SCENE_COLOR);
  },
};

// The dropdowns list the names that the triggers of the scenes have (a name that several scenes use is listed once), and "any trigger".
// Which sprite set the trigger off: any of them (as the block always was), or, inside a Sprite pool block, the pool sprite the pool is working on (see
// blocks/sprite-pool.js: the pool choices only show inside a pool, and "any pool sprite" is for the value block).
// (A project can name the sprite itself as well: that is what the pool choices become when the project is built.)
const TRIGGER_BY_OPTIONS = function() {
  const count = playerCount(((useConfigurationStorage() || {}).value || {}));
  return [['by any sprite', 'any'], ...Array.from({length: count}, (_, i) => ['by Player ' + i, 'player' + i]),
    ...(count > 2 ? [['by pool sprite', 'playerpool'], ['by any pool sprite', 'playerpoolany']] : [])];
};

export const buildTriggerOptions = () => {
  try {
    const data = processDataTablesStorageDefaults(useDataTablesStorage());
    const names = [];
    data.dataTables.filter(isSceneTable).forEach((table) => {
      decodeScene(table.values, table.triggerNames).triggers.forEach((trigger) => {
        if (!names.includes(trigger.name)) names.push(trigger.name);
      });
    });
    return [['any trigger', '*'], ...names.map((name) => [name, name])];
  } catch (e) {
    console.error('Failed to list trigger options', e);
    return [['any trigger', '*']];
  }
};

// "On trigger": the blocks inside run when a trigger of the scene that is showing acts (once, for the one frame): the project's actions for it.
Blockly.Blocks['trigger_on'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${SCENE_ICON} On trigger`)
        .appendField(new Blockly.FieldDropdown(buildTriggerOptions), 'TRIGGER')
        .appendField(new Blockly.FieldDropdown(TRIGGER_BY_OPTIONS), 'BY');
    this.appendStatementInput('DO');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SCENE_COLOR);
    this.setTooltip('Runs the blocks inside once when a sprite touches a trigger of the scene that is showing (a rectangle placed on the Scene tab): ' +
      'in the frame it comes in, and not again until that sprite has gone out of it. The trigger is picked by its name, so scenes can use the same ' +
      'names (an "Exit" in every scene); "any trigger" runs for each. Choose which sprites set a trigger off on the Scene tab.');
  },
};

// The same by number: the place of the trigger in the list on the card of the scene, starting at 1, and the ID of the scene (0 for the scene that
// is showing); both can be any value.
Blockly.Blocks['trigger_on_by_number'] = {
  init: function() {
    this.appendValueInput('TRIGGER')
        .setCheck('Number')
        .appendField(`${SCENE_ICON} On trigger number`);
    this.appendValueInput('SCENE')
        .setCheck('Number')
        .appendField('of scene ID');
    this.appendStatementInput('DO');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SCENE_COLOR);
    this.setTooltip('Like "On trigger", for the trigger whose number (its place in the list on the card of the scene, starting at 1) and scene ID ' +
      '(the ID on the card) are given, which can be variables or calculations. A scene ID of 0 means the scene that is showing.');
  },
};

Blockly.Blocks['trigger_fired'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${SCENE_ICON} Trigger`)
        .appendField(new Blockly.FieldDropdown(buildTriggerOptions), 'TRIGGER')
        .appendField(new Blockly.FieldDropdown(TRIGGER_BY_OPTIONS), 'BY')
        .appendField('fired');
    this.setOutput(true, 'Boolean');
    this.setColour(SCENE_COLOR);
    this.setTooltip('True for one frame when a sprite touched a trigger of the scene that is showing (a rectangle placed on the Scene tab): the frame it ' +
      'came into it, so the project can play a sound or change the score for it. A trigger acts when a sprite comes into it, and not again until ' +
      'that sprite has gone out of it. The trigger is picked by its name; "any trigger" is true for each.');
  },
};
