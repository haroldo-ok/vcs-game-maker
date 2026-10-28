import {useConfigurationStorage} from './project';

// The project's options, read where it runs often (every sound buffer, every color looked up). useConfigurationStorage() makes new
// watchers each time it is called, and they pile up on the component that is open (millions of them froze the page when the Music tab was
// left after a song had played): the storage is made once here and read from.
let storage = null;
export const configurationValue = () => {
  if (!storage) storage = useConfigurationStorage();
  return storage.value;
};
