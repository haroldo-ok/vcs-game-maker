const assembleDeclarations = (base, items) => items.map(item => ({ ...base, ...item }))

export const baseVariables = [
  // Player 0
  ...assembleDeclarations({ icon: 'mdi-account', color: 'red' }, [
    {
      variable: 'player0x',
      subIcon: 'mdi-arrow-left-right',
      name: 'Player 0 X'
    },
    {
      variable: 'player0y',
      subIcon: 'mdi-arrow-up-down',
      name: 'Player 0 Y'
    },
    {
      variable: 'player0color',
      subIcon: 'mdi-palette',
      name: 'Player 0 color'
    },
  ]),

  // Player 1
  ...assembleDeclarations({ icon: 'mdi-account', color: 'blue' }, [
    {
      variable: 'player1x',
      subIcon: 'mdi-arrow-left-right',
      name: 'Player 1 X'
    },
    {
      variable: 'player1y',
      subIcon: 'mdi-arrow-up-down',
      name: 'Player 1 Y'
    },
    {
      variable: 'player1color',
      subIcon: 'mdi-palette',
      name: 'Player 1 color'
    }
  ]),

  // Missile 0
  ...assembleDeclarations({ icon: 'mdi-rocket', color: 'red' }, [
    {
      variable: 'missile0x',
      subIcon: 'mdi-arrow-left-right',
      name: 'Missile 0 X'
    },
    {
      variable: 'missile0y',
      subIcon: 'mdi-arrow-up-down',
      name: 'Missile 0 Y'
    },
    {
      variable: 'missile0height',
      subIcon: 'mdi-human-male-height',
      name: 'Missile 0 height'
    }
  ]),

  // Missile 1
  ...assembleDeclarations({ icon: 'mdi-rocket', color: 'blue' }, [
    {
      variable: 'missile1x',
      subIcon: 'mdi-arrow-left-right',
      name: 'Missile 1 X'
    },
    {
      variable: 'missile1y',
      subIcon: 'mdi-arrow-up-down',
      name: 'Missile 1 Y'
    },
    {
      variable: 'missile1height',
      subIcon: 'mdi-human-male-height',
      name: 'Missile 1 height'
    }
  ]),

  // Ball
  ...assembleDeclarations({ icon: 'mdi-tennis-ball', color: 'orange' }, [
    {
      variable: 'ballx',
      subIcon: 'mdi-arrow-left-right',
      name: 'Ball X'
    },
    {
      variable: 'bally',
      subIcon: 'mdi-arrow-up-down',
      name: 'Ball Y'
    },
    {
      variable: 'ballheight',
      subIcon: 'mdi-human-male-height',
      name: 'Ball height'
    }
  ]),
]