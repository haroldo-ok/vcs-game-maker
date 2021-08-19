import {useJsonLocalStorage, useLocalStorage} from '../hooks/storage';

const keyOf = (type) =>`vcs-game-maker.${type}`;

export const useProjectStorage = (type) => useLocalStorage(keyOf(type));
export const useJsonProjectStorage = (type) => useJsonLocalStorage(keyOf(type));

export const useWorkspaceStorage = () => useProjectStorage('workspace');
export const useBackgroundsStorage = () => useJsonProjectStorage('backgrounds');
export const usePlayer0Storage = () => useJsonProjectStorage('player0');
export const usePlayer1Storage = () => useJsonProjectStorage('player1');
