import {ref} from '@vue/composition-api';

// A link elsewhere in the app can ask the Options tab to open the section an option is in and scroll to it. It sets
// this to the id of the option's element, and the Options tab clears it once it has shown it.
export const optionToReveal = ref(null);
