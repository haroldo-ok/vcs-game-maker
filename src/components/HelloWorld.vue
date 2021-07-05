<template>
  <v-container>
	<v-select :items="testItems">
		<template slot="selection" slot-scope="data">
			<!-- HTML that describe how select should render selected items -->
			<v-icon :color="data.item.color">{{ data.item.icon }}</v-icon>
			{{ data.item.name }}
		</template>
		<template slot="item" slot-scope="data">
			<!-- HTML that describe how select should render items when the select is open -->
      <v-icon :color="data.item.color">{{ data.item.icon }}</v-icon>
      <v-icon :color="data.item.color" v-if="data.item.subIcon">{{ data.item.subIcon }}</v-icon>
			{{ data.item.name }}
		</template>
	</v-select>
	
    <v-row class="text-center">
      <v-col cols="12">
        <v-img
          :src="require('../assets/logo.svg')"
          class="my-3"
          contain
          height="200"
        />
      </v-col>

      <v-col class="mb-4">
        <h1 class="display-2 font-weight-bold mb-3">
          Welcome to Vuetify
        </h1>

        <p class="subheading font-weight-regular">
          For help and collaboration with other Vuetify developers,
          <br>please join our online
          <a
            href="https://community.vuetifyjs.com"
            target="_blank"
          >Discord Community</a>
        </p>
      </v-col>

      <v-col
        class="mb-5"
        cols="12"
      >
        <h2 class="headline font-weight-bold mb-3">
          What's next?
        </h2>

        <v-row justify="center">
          <a
            v-for="(next, i) in whatsNext"
            :key="i"
            :href="next.href"
            class="subheading mx-3"
            target="_blank"
          >
            {{ next.text }}
          </a>
        </v-row>
      </v-col>

      <v-col
        class="mb-5"
        cols="12"
      >
        <h2 class="headline font-weight-bold mb-3">
          Important Links
        </h2>

        <v-row justify="center">
          <a
            v-for="(link, i) in importantLinks"
            :key="i"
            :href="link.href"
            class="subheading mx-3"
            target="_blank"
          >
            {{ link.text }}
          </a>
        </v-row>
      </v-col>

      <v-col
        class="mb-5"
        cols="12"
      >
        <h2 class="headline font-weight-bold mb-3">
          Ecosystem
        </h2>

        <v-row justify="center">
          <a
            v-for="(eco, i) in ecosystem"
            :key="i"
            :href="eco.href"
            class="subheading mx-3"
            target="_blank"
          >
            {{ eco.text }}
          </a>
        </v-row>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  export default {
    name: 'HelloWorld',

    data: () => ({
      testItems: [
        // Player 0
        {
          variable: 'player0x',
          icon: 'mdi-account',
          subIcon: 'mdi-arrow-left-right',
          color: 'red',
          name: 'Player 0 X'
        },
        {
          variable: 'player0y',
          icon: 'mdi-account',
          subIcon: 'mdi-arrow-up-down',
          color: 'red',
          name: 'Player 0 Y'
        },
        {
          variable: 'player0color',
          icon: 'mdi-account',
          subIcon: 'mdi-palette',
          color: 'red',
          name: 'Player 0 color'
        },

        // Player 1
        {
          variable: 'player1x',
          icon: 'mdi-account',
          subIcon: 'mdi-arrow-left-right',
          color: 'blue',
          name: 'Player 1 X'
        },
        {
          variable: 'player1y',
          icon: 'mdi-account',
          subIcon: 'mdi-arrow-up-down',
          color: 'blue',
          name: 'Player 1 Y'
        },
        {
          variable: 'player1color',
          icon: 'mdi-account',
          subIcon: 'mdi-palette',
          color: 'blue',
          name: 'Player 1 color'
        },

        // Missile 0
        {
          variable: 'missile0x',
          icon: 'mdi-rocket',
          subIcon: 'mdi-arrow-left-right',
          color: 'red',
          name: 'Missile 0 X'
        },
        {
          variable: 'missile0y',
          icon: 'mdi-rocket',
          subIcon: 'mdi-arrow-up-down',
          color: 'red',
          name: 'Missile 0 Y'
        },
        {
          variable: 'missile0height',
          icon: 'mdi-rocket',
          subIcon: 'mdi-human-male-height',
          color: 'red',
          name: 'Missile 0 height'
        },

        // Missile 1
        {
          variable: 'missile1x',
          icon: 'mdi-rocket',
          subIcon: 'mdi-arrow-left-right',
          color: 'blue',
          name: 'Missile 1 X'
        },
        {
          variable: 'missile1y',
          icon: 'mdi-rocket',
          subIcon: 'mdi-arrow-up-down',
          color: 'blue',
          name: 'Missile 1 Y'
        },
        {
          variable: 'missile1height',
          icon: 'mdi-rocket',
          subIcon: 'mdi-human-male-height',
          color: 'blue',
          name: 'Missile 1 height'
        },

        // Ball
        {
          variable: 'ballx',
          icon: 'mdi-tennis-ball',
          subIcon: 'mdi-arrow-left-right',
          color: 'orange',
          name: 'Ball X'
        },
        {
          variable: 'bally',
          icon: 'mdi-tennis-ball',
          subIcon: 'mdi-arrow-up-down',
          color: 'orange',
          name: 'Ball Y'
        },
        {
          variable: 'ballheight',
          icon: 'mdi-tennis-ball',
          subIcon: 'mdi-human-male-height',
          color: 'orange',
          name: 'Ball height'
        }
      ],

      ecosystem: [
        {
          text: 'vuetify-loader',
          href: 'https://github.com/vuetifyjs/vuetify-loader',
        },
        {
          text: 'github',
          href: 'https://github.com/vuetifyjs/vuetify',
        },
        {
          text: 'awesome-vuetify',
          href: 'https://github.com/vuetifyjs/awesome-vuetify',
        },
      ],
      importantLinks: [
        {
          text: 'Documentation',
          href: 'https://vuetifyjs.com',
        },
        {
          text: 'Chat',
          href: 'https://community.vuetifyjs.com',
        },
        {
          text: 'Made with Vuetify',
          href: 'https://madewithvuejs.com/vuetify',
        },
        {
          text: 'Twitter',
          href: 'https://twitter.com/vuetifyjs',
        },
        {
          text: 'Articles',
          href: 'https://medium.com/vuetify',
        },
      ],
      whatsNext: [
        {
          text: 'Explore components',
          href: 'https://vuetifyjs.com/components/api-explorer',
        },
        {
          text: 'Select a layout',
          href: 'https://vuetifyjs.com/getting-started/pre-made-layouts',
        },
        {
          text: 'Frequently Asked Questions',
          href: 'https://vuetifyjs.com/getting-started/frequently-asked-questions',
        },
      ],
    }),
  }
</script>
