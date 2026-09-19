/**
 * Local Project Storage (localStorage)
 * Saves and retrieves calculator results without requiring login.
 * Works for anonymous users, data persists on device.
 */

const STORAGE_KEY = 'frelux_saved_projects';
const MAX_PROJECTS = 20;

export interface LocalProject {
  id: string;
  name: string;
  type: 'paint_calc' | 'cost_estimate' | 'screeding_calc' | 'tile_calc' | 'pop_calc';
  data: Record<string, unknown>;
  createdAt: string;
}

function getStorage(): LocalProject[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as LocalProject[];
  } catch {
    return [];
  }
}

function setStorage(projects: LocalProject[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  } catch {
    // Storage full or unavailable, silently fail
  }
}

export function saveLocalProject(
  name: string,
  type: LocalProject['type'],
  data: Record<string, unknown>,
): LocalProject | null {
  const projects = getStorage();
  const project: LocalProject = {
    id: `local_${Date.now()}`,
    name,
    type,
    data,
    createdAt: new Date().toISOString(),
  };
  projects.unshift(project);
  // Keep only the most recent MAX_PROJECTS
  if (projects.length > MAX_PROJECTS) {
    projects.splice(MAX_PROJECTS);
  }
  setStorage(projects);
  return project;
}

export function getLocalProjects(): LocalProject[] {
  return getStorage();
}

export function getLocalProjectsByType(type: LocalProject['type']): LocalProject[] {
  return getStorage().filter((p) => p.type === type);
}

export function deleteLocalProject(id: string): void {
  const projects = getStorage().filter((p) => p.id !== id);
  setStorage(projects);
}

export function clearLocalProjects(): void {
  setStorage([]);
}

export function hasLocalProjects(): boolean {
  return getStorage().length > 0;
}
