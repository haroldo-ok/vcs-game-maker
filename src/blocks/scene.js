'use strict';

import * as Blockly from 'blockly/core';

import {useDataTablesStorage} from '../hooks/project';
import {processDataTablesStorageDefaults} from './data';
import {isSceneTable} from '../utils/scene';
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
