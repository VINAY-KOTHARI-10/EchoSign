import { create } from 'zustand';

// Zustand store: small UI state shared between components that do not need a provider around them.
// Right now: whether the mobile navigation drawer is open.
export const useUiStore = create((set) => ({
  navOpen: false,
  setNavOpen: (open) => set({ navOpen: Boolean(open) }),
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
}));
