import {useJsonLocalStorage, useLocalStorage} from '../hooks/storage';

const keyOf = (type) =>`vcs-game-maker.${type}`;

export const useProjectStorage = (type) => useLocalStorage(keyOf(type));
export const useJsonProjectStorage = (type) => useJsonLocalStorage(keyOf(type));

export const useWorkspaceStorage = () => useProjectStorage('workspace');
export const useBackgroundsStorage = () => useJsonProjectStorage('backgrounds');

