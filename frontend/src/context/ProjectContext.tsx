import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Project, ScanRun, ArchitectureDefinition } from '../types';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

interface ProjectContextType {
  projects: Project[];
  activeProject: Project | null;
  setActiveProject: (project: Project | null) => void;
  latestScan: ScanRun | null;
  activeArchitecture: ArchitectureDefinition | null;
  architectureList: ArchitectureDefinition[];
  isArchLoading: boolean;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
  refreshProjects: () => Promise<void>;
  refreshLatestScan: (projectId: string) => Promise<void>;
  refreshArchitectures: (projectId?: string) => Promise<ArchitectureDefinition[]>;
  activateProjectArchitecture: (archId: string) => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProject, setActiveProjectState] = useState<Project | null>(null);
  const [latestScan, setLatestScan] = useState<ScanRun | null>(null);
  const [activeArchitecture, setActiveArchitecture] = useState<ArchitectureDefinition | null>(null);
  const [architectureList, setArchitectureList] = useState<ArchitectureDefinition[]>([]);
  const [isArchLoading, setIsArchLoading] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const currentProjectIdRef = React.useRef<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const refreshArchitectures = useCallback(
    async (projectId?: string): Promise<ArchitectureDefinition[]> => {
      const targetId = projectId || activeProject?.id || currentProjectIdRef.current || undefined;
      if (!isAuthenticated || !targetId) {
        setArchitectureList([]);
        setActiveArchitecture(null);
        setIsArchLoading(false);
        return [];
      }

      setIsArchLoading(true);
      try {
        const list = await api.getProjectArchitectures(targetId);
        // Only commit state if this target is still the active project
        if (currentProjectIdRef.current && currentProjectIdRef.current !== targetId) {
          return list;
        }

        const validList = list.filter((a) => a.project_id === targetId);
        setArchitectureList(validList);
        if (validList.length > 0) {
          const active = validList.find((a) => a.is_active) || validList[0];
          setActiveArchitecture(active);
        } else {
          setActiveArchitecture(null);
        }
        return validList;
      } catch (err) {
        console.warn('Failed to load project architectures:', err);
        if (!currentProjectIdRef.current || currentProjectIdRef.current === targetId) {
          setArchitectureList([]);
          setActiveArchitecture(null);
        }
        return [];
      } finally {
        if (!currentProjectIdRef.current || currentProjectIdRef.current === targetId) {
          setIsArchLoading(false);
        }
      }
    },
    [isAuthenticated, activeProject?.id]
  );

  const activateProjectArchitecture = useCallback(
    async (archId: string) => {
      try {
        await api.activateArchitecture(archId);
        const targetId = activeProject?.id || currentProjectIdRef.current;
        if (targetId) {
          await refreshArchitectures(targetId);
        }
      } catch (err: any) {
        console.error('Failed to activate architecture:', err);
        throw err;
      }
    },
    [activeProject, refreshArchitectures]
  );

  const refreshLatestScan = useCallback(
    async (projectId: string) => {
      if (!isAuthenticated) return;
      try {
        const scans = await api.getProjectScans(projectId);
        if (currentProjectIdRef.current && currentProjectIdRef.current !== projectId) {
          return;
        }
        if (scans.length > 0) {
          setLatestScan(scans[0]);
        } else {
          setLatestScan(null);
        }
      } catch {
        if (!currentProjectIdRef.current || currentProjectIdRef.current === projectId) {
          setLatestScan(null);
        }
      }
    },
    [isAuthenticated]
  );

  const setActiveProject = useCallback(
    (project: Project | null) => {
      currentProjectIdRef.current = project?.id || null;
      setActiveProjectState(project);
      // Immediately reset architecture and scan state to prevent data leakage from previous project
      setActiveArchitecture(null);
      setArchitectureList([]);
      setLatestScan(null);

      if (project) {
        localStorage.setItem('active_project_id', project.id);
        setIsArchLoading(true);
        refreshLatestScan(project.id);
        refreshArchitectures(project.id);
      } else {
        localStorage.removeItem('active_project_id');
        setIsArchLoading(false);
      }
    },
    [refreshLatestScan, refreshArchitectures]
  );

  const refreshProjects = useCallback(async () => {
    // If not authenticated, clear project state and exit immediately
    if (!isAuthenticated) {
      currentProjectIdRef.current = null;
      setProjects([]);
      setActiveProjectState(null);
      setLatestScan(null);
      setActiveArchitecture(null);
      setArchitectureList([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const projs = await api.getProjects();
      setProjects(projs);

      const storedId = localStorage.getItem('active_project_id');
      if (storedId) {
        const found = projs.find((p) => p.id === storedId);
        if (found) {
          currentProjectIdRef.current = found.id;
          setActiveProjectState(found);
          setActiveArchitecture(null);
          setArchitectureList([]);
          setLatestScan(null);
          setIsArchLoading(true);
          refreshLatestScan(found.id);
          refreshArchitectures(found.id);
          setIsLoading(false);
          return;
        }
      }

      // Default to first project if available
      if (projs.length > 0) {
        currentProjectIdRef.current = projs[0].id;
        setActiveProjectState(projs[0]);
        localStorage.setItem('active_project_id', projs[0].id);
        setActiveArchitecture(null);
        setArchitectureList([]);
        setLatestScan(null);
        setIsArchLoading(true);
        refreshLatestScan(projs[0].id);
        refreshArchitectures(projs[0].id);
      } else {
        currentProjectIdRef.current = null;
        setActiveProjectState(null);
        setLatestScan(null);
        setActiveArchitecture(null);
        setArchitectureList([]);
      }
    } catch (err: any) {
      if (err.status === 401 || err.message?.includes('Authentication required')) {
        currentProjectIdRef.current = null;
        setProjects([]);
        setActiveProjectState(null);
        setLatestScan(null);
        setActiveArchitecture(null);
        setArchitectureList([]);
        setError(null);
      } else {
        setError(err.message || 'Failed to load projects');
      }
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, refreshLatestScan, refreshArchitectures]);

  // Synchronize projects whenever authentication status is determined or updated
  useEffect(() => {
    if (!authLoading) {
      refreshProjects();
    }
  }, [isAuthenticated, authLoading, refreshProjects]);

  return (
    <ProjectContext.Provider
      value={{
        projects,
        activeProject,
        setActiveProject,
        latestScan,
        activeArchitecture,
        architectureList,
        isArchLoading,
        isLoading,
        error,
        clearError,
        refreshProjects,
        refreshLatestScan,
        refreshArchitectures,
        activateProjectArchitecture,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = (): ProjectContextType => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
