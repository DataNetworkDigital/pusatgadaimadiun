import { createContext, useContext } from 'react';

const DemoContext = createContext({ isDemo: false, collectionPrefix: '' });

export function DemoProvider({ isDemo = false, children }) {
  const value = { isDemo, collectionPrefix: isDemo ? 'demo_' : '' };
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  return useContext(DemoContext);
}
