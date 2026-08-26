// Shared between generators/bbasic.js's own pre-scan (which reserves the
// dev var) and generators/bbasic/input.js's getter generators (which read
// it back) - both sides have to resolve the exact same canonical name
// through Blockly.BBasic.nameDB_.getName for a project's "Keypad N: key X
// is pressed" blocks to actually read whatever generateKeypadPollAsm wrote.
// port is '0' or '1' (matches the joy0/joy1 port-numbering convention
// already used throughout blocks/input.js).
export const keypadKeyVarName = (port) => `_keypad${port}_key`;
