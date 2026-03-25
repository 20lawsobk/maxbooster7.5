import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { ChevronDown, FolderOpen, Plus, Music } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';

interface Project {
  id: string;
  title: string;
  genre?: string | null;
  status?: string | null;
  updatedAt?: string | null;
}

interface ProjectsApiResponse {
  data: Project[];
}

interface ProjectSelectorProps {
  currentProjectId: string | null;
  onProjectChange?: (projectId: string) => void;
  className?: string;
}

export function ProjectSelector({ currentProjectId, onProjectChange, className }: ProjectSelectorProps) {
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const { data: projectsData, isLoading } = useQuery<ProjectsApiResponse>({
    queryKey: ['/api/projects'],
    enabled: !!user,
  });

  const projects = projectsData?.data || [];
  const currentProject = projects.find(p => p.id === currentProjectId);

  const handleProjectSelect = (projectId: string) => {
    if (projectId !== currentProjectId) {
      setLocation(`/studio/${projectId}`);
      onProjectChange?.(projectId);
    }
  };

  const handleNewProject = () => {
    setLocation('/studio');
  };

  const handleViewAllProjects = () => {
    setLocation('/projects');
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          className={cn(
            "h-8 px-3 gap-2 text-sm font-medium text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-700",
            className
          )}
        >
          <Music className="w-4 h-4 text-emerald-400" />
          <span className="max-w-[200px] truncate">
            {isLoading ? 'Loading…' : currentProject?.title || 'New Project'}
          </span>
          <ChevronDown className="w-4 h-4 text-zinc-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent 
        align="start" 
        className="w-72 bg-zinc-900 border-zinc-700"
      >
        <div className="px-2 py-1.5 text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Recent Projects
        </div>
        {projects.length === 0 && !isLoading && (
          <div className="px-2 py-4 text-sm text-zinc-500 text-center">
            No projects yet
          </div>
        )}
        {projects.slice(0, 10).map((project) => (
          <DropdownMenuItem
            key={project.id}
            onClick={() => handleProjectSelect(project.id)}
            className={cn(
              "flex items-center gap-3 px-2 py-2 cursor-pointer",
              project.id === currentProjectId && "bg-zinc-800"
            )}
          >
            <div className={cn(
              "w-8 h-8 rounded flex items-center justify-center text-xs font-bold",
              project.id === currentProjectId 
                ? "bg-emerald-500/20 text-emerald-400" 
                : "bg-zinc-700 text-zinc-400"
            )}>
              {project.title.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-zinc-200 truncate">
                {project.title}
              </div>
              <div className="text-xs text-zinc-500 truncate">
                {project.genre || 'No genre'} 
                {project.status && ` · ${project.status}`}
              </div>
            </div>
            {project.id === currentProjectId && (
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="bg-zinc-700" />
        <DropdownMenuItem
          onClick={handleNewProject}
          className="flex items-center gap-2 px-2 py-2 cursor-pointer text-emerald-400"
        >
          <Plus className="w-4 h-4" />
          <span>New Project</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleViewAllProjects}
          className="flex items-center gap-2 px-2 py-2 cursor-pointer text-zinc-300"
        >
          <FolderOpen className="w-4 h-4" />
          <span>View All Projects</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
