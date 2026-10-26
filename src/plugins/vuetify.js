import Vue from 'vue';
import Vuetify from 'vuetify/lib/framework';
import VTextField from 'vuetify/lib/components/VTextField/VTextField';

import DrumIcon from '../components/DrumIcon.vue';

Vue.use(Vuetify);

// A text field only says its value has changed ("change") when it is left or Enter is pressed, but the arrows of a number field (the buttons
// at the right of it, and the up and down keys) change the value at once, and nothing that waits for "change" saw them until the field was
// left. The arrows make an "input" event that is not a typed character (it has no inputType), and it is told as a change here, for every number
// field of the app. Typing and pasting keep waiting for the field to be left, so a number that is half typed is not acted on.
const originalOnInput = VTextField.options.methods.onInput;
VTextField.options.methods.onInput = function(event) {
  originalOnInput.call(this, event);
  const target = event && event.target;
  if (target && target.type === 'number' && !event.inputType && this.lazyValue !== this.initialValue) {
    this.initialValue = this.lazyValue;
    this.$emit('change', this.lazyValue);
  }
};

export default new Vuetify({
  icons: {
    values: {
      // Used as <v-icon>$drum</v-icon>: the Material Design icon font has no drum.
      drum: {component: DrumIcon},
    },
  },
});
