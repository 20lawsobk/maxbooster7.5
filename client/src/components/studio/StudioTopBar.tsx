import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  MousePointer2,
  Scissors,
  Trash2,
  ZoomIn,
  ZoomOut,
  Grid3x3,
  Settings,
  Activity,
  Cpu,
  Clock,
  Upload,
  Save,
  Plus,
  FolderOpen,
  HelpCircle,
} from 'lucide-react';

interface Project {
  id: string;
  title: string;
  name?: string;
}

interface StudioTopBarProps {
  tempo: number;
  timeSignature: string;
  cpuUsage: number;
  zoom: number;
  selectedTool?: 'select' | 'cut' | 'delete';
  selectedProject?: Project | null;
  projects?: Project[];
  onToolSelect: (tool: 'select' | 'cut' | 'delete') => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onOpenSettings?: () => void;
  onProjectChange?: (projectId: string) => void;
  onCreateProject?: (title: string) => void;
  onUploadFile?: () => void;
  onSaveProject?: () => void;
  onShowTutorial?: () => void;
  isSaving?: boolean;
}

/**
 * TODO: Add function documentation
 */
export function StudioTopBar({
  tempo,
  timeSignature,
  cpuUsage,
  zoom,
  selectedTool = 'select',
  selectedProject,
  projects = [],
  onToolSelect,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onOpenSettings,
  onProjectChange,
  onCreateProject,
  onUploadFile,
  onSaveProject,
  onShowTutorial,
  isSaving = false,
}: StudioTopBarProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState('');
  const isMobile = useIsMobile();

  const handleCreateProject = () => {
    if (newProjectTitle.trim() && onCreateProject) {
      onCreateProject(newProjectTitle.trim());
      setNewProjectTitle('');
      setShowCreateDialog(false);
    }
  };

  return (
    <>
      <div className={`h-full ${isMobile ? 'px-2 py-1' : 'px-6'} flex items-center justify-between gap-2 md:gap-6`}>
        {/* Left: Project Controls */}
        <div className="flex items-center gap-1 md:gap-3 flex-1 min-w-0">
          <Select value={selectedProject?.id || ''} onValueChange={onProjectChange}>
            <SelectTrigger
              className={`${isMobile ? 'w-[120px]' : 'w-[220px]'} h-9 text-sm font-medium`}
              style={{
                background: 'var(--studio-surface)',
                borderColor: 'var(--studio-border-subtle)',
                color: 'var(--studio-text)',
                boxShadow: 'var(--studio-shadow-sm), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
              data-testid="select-project"
            >
              <SelectValue placeholder="Select project..." />
            </SelectTrigger>
            <SelectContent
              style={{
                background: 'var(--studio-surface-elevated)',
                borderColor: 'var(--studio-border)',
                boxShadow: 'var(--studio-shadow-lg)',
              }}
            >
              {projects.map((project) => (
                <SelectItem
                  key={project.id}
                  value={project.id}
                  style={{ color: 'var(--studio-text)' }}
                >
                  {project.title || project.name || 'Untitled'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-9 w-9 rounded-md flex items-center justify-center transition-all"
                  style={{
                    background: 'var(--studio-surface)',
                    color: 'var(--studio-text-muted)',
                    border: '1px solid var(--studio-border-subtle)',
                    boxShadow: 'var(--studio-shadow-sm), inset 0 1px 0 rgba(255,255,255,0.05)',
                  }}
                  onClick={() => setShowCreateDialog(true)}
                  data-testid="button-create-project"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--studio-surface-elevated)';
                    e.currentTarget.style.color = 'var(--studio-accent)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'var(--studio-surface)';
                    e.currentTarget.style.color = 'var(--studio-text-muted)';
                  }}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Create New Project</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-9 w-9 rounded-md flex items-center justify-center transition-all"
                  style={{
                    background: selectedProject
                      ? 'var(--studio-surface)'
                      : 'var(--studio-bg-medium)',
                    color: selectedProject
                      ? 'var(--studio-text-muted)'
                      : 'var(--studio-text-subtle)',
                    border: '1px solid var(--studio-border-subtle)',
                    boxShadow: selectedProject
                      ? 'var(--studio-shadow-sm), inset 0 1px 0 rgba(255,255,255,0.05)'
                      : 'none',
                    opacity: selectedProject ? 1 : 0.5,
                    cursor: selectedProject ? 'pointer' : 'not-allowed',
                  }}
                  onClick={onUploadFile}
                  disabled={!selectedProject}
                  data-testid="button-upload-file"
                  onMouseEnter={(e) => {
                    if (selectedProject) {
                      e.currentTarget.style.background = 'var(--studio-surface-elevated)';
                      e.currentTarget.style.color = 'var(--studio-accent)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedProject) {
                      e.currentTarget.style.background = 'var(--studio-surface)';
                      e.currentTarget.style.color = 'var(--studio-text-muted)';
                    }
                  }}
                >
                  <Upload className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Upload Audio File</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-9 w-9 rounded-md flex items-center justify-center transition-all"
                  style={{
                    background:
                      selectedProject && !isSaving
                        ? 'var(--studio-surface)'
                        : 'var(--studio-bg-medium)',
                    color:
                      selectedProject && !isSaving
                        ? 'var(--studio-text-muted)'
                        : 'var(--studio-text-subtle)',
                    border: '1px solid var(--studio-border-subtle)',
                    boxShadow:
                      selectedProject && !isSaving
                        ? 'var(--studio-shadow-sm), inset 0 1px 0 rgba(255,255,255,0.05)'
                        : 'none',
                    opacity: selectedProject && !isSaving ? 1 : 0.5,
                    cursor: selectedProject && !isSaving ? 'pointer' : 'not-allowed',
                  }}
                  onClick={onSaveProject}
                  disabled={!selectedProject || isSaving}
                  data-testid="button-save-project"
                  onMouseEnter={(e) => {
                    if (selectedProject && !isSaving) {
                      e.currentTarget.style.background = 'var(--studio-surface-elevated)';
                      e.currentTarget.style.color = 'var(--studio-accent)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedProject && !isSaving) {
                      e.currentTarget.style.background = 'var(--studio-surface)';
                      e.currentTarget.style.color = 'var(--studio-text-muted)';
                    }
                  }}
                >
                  <Save className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>{isSaving ? 'Saving...' : 'Save Project'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <div className="h-6 w-px" style={{ background: 'var(--studio-border)' }} />
        </div>

        {/* Center: Tool Selection & Zoom */}
        <div className="flex items-center gap-2">
          <TooltipProvider>
            <div
              className="flex items-center gap-1 p-1 rounded-md"
              style={{ background: 'var(--studio-bg-medium)' }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="h-8 w-8 rounded flex items-center justify-center transition-all"
                    onClick={() => onToolSelect('select')}
                    data-testid="button-tool-select"
                    style={{
                      background:
                        selectedTool === 'select'
                          ? 'linear-gradient(135deg, var(--studio-accent) 0%, var(--studio-accent-active) 100%)'
                          : 'transparent',
                      color: selectedTool === 'select' ? 'white' : 'var(--studio-text-muted)',
                      boxShadow: selectedTool === 'select' ? 'var(--studio-shadow-sm)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTool !== 'select') {
                        e.currentTarget.style.color = 'var(--studio-text)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTool !== 'select') {
                        e.currentTarget.style.color = 'var(--studio-text-muted)';
                      }
                    }}
                  >
                    <MousePointer2 className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Select Tool (V)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="h-8 w-8 rounded flex items-center justify-center transition-all"
                    onClick={() => onToolSelect('cut')}
                    data-testid="button-tool-cut"
                    style={{
                      background:
                        selectedTool === 'cut'
                          ? 'linear-gradient(135deg, var(--studio-accent) 0%, var(--studio-accent-active) 100%)'
                          : 'transparent',
                      color: selectedTool === 'cut' ? 'white' : 'var(--studio-text-muted)',
                      boxShadow: selectedTool === 'cut' ? 'var(--studio-shadow-sm)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTool !== 'cut') {
                        e.currentTarget.style.color = 'var(--studio-text)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTool !== 'cut') {
                        e.currentTarget.style.color = 'var(--studio-text-muted)';
                      }
                    }}
                  >
                    <Scissors className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Cut Tool (C)</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="h-8 w-8 rounded flex items-center justify-center transition-all"
                    onClick={() => onToolSelect('delete')}
                    data-testid="button-tool-delete"
                    style={{
                      background:
                        selectedTool === 'delete'
                          ? 'linear-gradient(135deg, var(--studio-accent) 0%, var(--studio-accent-active) 100%)'
                          : 'transparent',
                      color: selectedTool === 'delete' ? 'white' : 'var(--studio-text-muted)',
                      boxShadow: selectedTool === 'delete' ? 'var(--studio-shadow-sm)' : 'none',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedTool !== 'delete') {
                        e.currentTarget.style.color = 'var(--studio-text)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedTool !== 'delete') {
                        e.currentTarget.style.color = 'var(--studio-text-muted)';
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Delete Tool (D)</TooltipContent>
              </Tooltip>
            </div>

            <div className="h-6 w-px" style={{ background: 'var(--studio-border)' }} />

            {/* Zoom Controls */}
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="h-8 w-8 rounded-md flex items-center justify-center transition-all"
                    onClick={onZoomOut}
                    data-testid="button-zoom-out"
                    style={{
                      background: 'var(--studio-surface)',
                      color: 'var(--studio-text-muted)',
                      border: '1px solid var(--studio-border-subtle)',
                      boxShadow: 'var(--studio-shadow-sm)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--studio-surface-elevated)';
                      e.currentTarget.style.color = 'var(--studio-text)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--studio-surface)';
                      e.currentTarget.style.color = 'var(--studio-text-muted)';
                    }}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Zoom Out</TooltipContent>
              </Tooltip>

              <div
                className="h-7 px-3 rounded-md cursor-pointer flex items-center justify-center font-mono text-xs font-semibold transition-all"
                onClick={onZoomReset}
                data-testid="badge-zoom-level"
                style={{
                  background: 'var(--studio-surface)',
                  color: 'var(--studio-text)',
                  border: '1px solid var(--studio-border-subtle)',
                  boxShadow: 'var(--studio-shadow-inner)',
                }}
              >
                {Math.round(zoom * 100)}%
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="h-8 w-8 rounded-md flex items-center justify-center transition-all"
                    onClick={onZoomIn}
                    data-testid="button-zoom-in"
                    style={{
                      background: 'var(--studio-surface)',
                      color: 'var(--studio-text-muted)',
                      border: '1px solid var(--studio-border-subtle)',
                      boxShadow: 'var(--studio-shadow-sm)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--studio-surface-elevated)';
                      e.currentTarget.style.color = 'var(--studio-text)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--studio-surface)';
                      e.currentTarget.style.color = 'var(--studio-text-muted)';
                    }}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Zoom In</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>

        {/* Center: Project Info */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--studio-text)' }}
              data-testid="text-tempo"
            >
              {tempo} BPM
            </span>
          </div>
          <div
            className="text-sm"
            style={{ color: 'var(--studio-text-muted)' }}
            data-testid="text-time-signature"
          >
            {timeSignature}
          </div>
        </div>

        {/* Right: Status Indicators */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />
            <div className="flex items-center gap-1.5">
              <div
                className="h-1.5 w-12 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--studio-bg-deep)' }}
              >
                <div
                  className="h-full transition-all duration-300"
                  style={{
                    width: `${cpuUsage}%`,
                    backgroundColor:
                      cpuUsage > 80
                        ? '#ef4444'
                        : cpuUsage > 60
                          ? '#f59e0b'
                          : 'var(--studio-accent)',
                  }}
                />
              </div>
              <span
                className="text-xs font-mono"
                style={{ color: 'var(--studio-text-muted)' }}
                data-testid="text-cpu-usage"
              >
                {Math.round(cpuUsage)}%
              </span>
            </div>
          </div>

          <Separator
            orientation="vertical"
            className="h-6"
            style={{ backgroundColor: 'var(--studio-border)' }}
          />

          {onShowTutorial && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={onShowTutorial}
                  data-testid="button-show-tutorial"
                  style={{ color: 'var(--studio-text)' }}
                >
                  <HelpCircle className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Show Studio Tutorial</TooltipContent>
            </Tooltip>
          )}

          {onOpenSettings && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={onOpenSettings}
              data-testid="button-settings"
              style={{ color: 'var(--studio-text)' }}
            >
              <Settings className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Create Project Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent
          style={{
            backgroundColor: 'var(--studio-bg-medium)',
            borderColor: 'var(--studio-border)',
            color: 'var(--studio-text)',
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--studio-text)' }}>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-title" style={{ color: 'var(--studio-text)' }}>
                Project Title
              </Label>
              <Input
                id="project-title"
                placeholder="My New Track"
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateProject();
                  }
                }}
                style={{
                  backgroundColor: 'var(--studio-bg-deep)',
                  borderColor: 'var(--studio-border)',
                  color: 'var(--studio-text)',
                }}
                data-testid="input-project-title"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowCreateDialog(false)}
              style={{ color: 'var(--studio-text)' }}
              data-testid="button-cancel-create"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateProject}
              disabled={!newProjectTitle.trim()}
              style={{
                backgroundColor: 'var(--studio-accent)',
                color: 'white',
              }}
              data-testid="button-confirm-create"
            >
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
