import { configureStore } from '@reduxjs/toolkit';
import recentClasses from './recentClassesSlice';

export const store = configureStore({ reducer: { recentClasses } });

// Remember the recent codes between visits (browser only; failures are ignored).
store.subscribe(() => {
  try { localStorage.setItem('echosign.recentClasses', JSON.stringify(store.getState().recentClasses.codes)); } catch { /* storage unavailable */ }
});
