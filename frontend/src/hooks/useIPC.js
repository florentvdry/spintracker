import { useState, useEffect, useCallback } from 'react';
import { ipcService } from '@services/ipcService';

/**
 * Hook générique pour les appels IPC avec état
 */
export function useIPC(channel, initialData = null) {
  const [data, setData] = useState(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const execute = useCallback(async (...args) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await ipcService.invoke(channel, ...args);
      
      if (result.success) {
        setData(result.data);
        return result;
      } else {
        setError(result.message || 'Unknown error');
        return result;
      }
    } catch (err) {
      setError(err.message);
      return { success: false, error: err };
    } finally {
      setIsLoading(false);
    }
  }, [channel]);

  return { data, isLoading, error, execute, setData };
}

/**
 * Hook pour les données du dashboard
 */
export function useDashboard() {
  const { data, isLoading, execute } = useIPC('get-dashboard-stats');
  
  useEffect(() => {
    execute();
  }, [execute]);

  return {
    stats: data,
    isLoading,
    refresh: execute,
  };
}

/**
 * Hook pour la liste des joueurs
 */
export function usePlayers(options = {}) {
  const [players, setPlayers] = useState([]);
  const [heroName, setHeroName] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadPlayers = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await ipcService.getPlayers(options);
      if (result.success) {
        setPlayers(result.data.players || []);
        setHeroName(result.data.heroName);
      }
    } finally {
      setIsLoading(false);
    }
  }, [JSON.stringify(options)]);

  useEffect(() => {
    loadPlayers();
  }, [loadPlayers]);

  return { players, heroName, isLoading, refresh: loadPlayers };
}

/**
 * Hook pour les données de graphique
 */
export function useChartData(options = {}) {
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await ipcService.getWinrateChartData(options);
      if (result.success) {
        setData(result.data || []);
      }
    } finally {
      setIsLoading(false);
    }
  }, [JSON.stringify(options)]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return { data, isLoading, refresh: loadData };
}

/**
 * Hook pour l'écoute des événements IPC
 */
export function useIPCEvent(channel, callback) {
  useEffect(() => {
    const unsubscribe = ipcService.on(channel, callback);
    return unsubscribe;
  }, [channel, callback]);
}

/**
 * Hook pour les préférences stockées
 */
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore
    }
  }, [key, value]);

  return [value, setValue];
}

/**
 * Hook pour debounce
 */
export function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
