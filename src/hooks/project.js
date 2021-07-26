import {useLocalStorage} from '../hooks/storage';

export const useProjectStorage = (type) => useLocalStorage(`vcs-game-maker.${type}`);
export const useWorkspaceStorage = () => useProjectStorage('workspace');
