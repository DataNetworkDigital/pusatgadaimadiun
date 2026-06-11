import { createContext, useContext, useState } from 'react';

// Holds the Project list's view state (tab / search / sort) so it survives
// navigating into a project detail and back. It lives above the routes but
// inside the unlocked area, so it resets on a full reload OR when the app
// re-locks (PIN), exactly as desired — not on plain navigation.
const ProjectUiContext = createContext(null);

export function ProjectUiProvider({ children }) {
  const [tab, setTab] = useState('active');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('start-desc');
  return (
    <ProjectUiContext.Provider value={{ tab, setTab, search, setSearch, sort, setSort }}>
      {children}
    </ProjectUiContext.Provider>
  );
}

export function useProjectUi() {
  const ctx = useContext(ProjectUiContext);
  if (!ctx) throw new Error('useProjectUi must be used within ProjectUiProvider');
  return ctx;
}
