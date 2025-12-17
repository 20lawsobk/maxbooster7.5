import { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Search,
  Mic,
  Music,
  Sliders,
  Gauge,
  Podcast,
  Film,
  Star,
  Users,
  Clock,
  Layers,
  Check,
  Plus,
  Save,
  ChevronRight,
  Sparkles,
  Volume2,
  Headphones,
  Download,
  Heart,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  StudioTemplate,
  TemplateCategory,
  TemplateTrack,
  BUILT_IN_TEMPLATES,
  CATEGORY_INFO,
  filterTemplates,
  createCustomTemplate,
} from '@/lib/studioTemplates';

interface SmartTemplatesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: StudioTemplate) => void;
  onSaveCustomTemplate?: (name: string, description: string) => void;
  currentTracks?: TemplateTrack[];
  recentTemplateIds?: string[];
  customTemplates?: StudioTemplate[];
  communityTemplates?: StudioTemplate[];
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Mic: Mic,
  Drum: Music,
  Sliders: Sliders,
  Gauge: Gauge,
  Podcast: Podcast,
  Film: Film,
  Star: Star,
  Users: Users,
};

function getCategoryIcon(iconName: string): React.ElementType {
  return CATEGORY_ICONS[iconName] || Layers;
}

function TrackPreview({ tracks, maxDisplay = 8 }: { tracks: TemplateTrack[]; maxDisplay?: number }) {
  const displayTracks = tracks.slice(0, maxDisplay);
  const remaining = tracks.length - maxDisplay;

  return (
    <div className="space-y-1">
      {displayTracks.map((track) => (
        <div
          key={track.id}
          className="flex items-center gap-2 px-2 py-1 rounded text-xs"
          style={{ backgroundColor: 'var(--studio-bg-deep)' }}
        >
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: track.color }}
          />
          <span
            className="truncate flex-1"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            {track.name}
          </span>
          <span
            className="text-[10px] uppercase"
            style={{ color: 'var(--studio-text-subtle)' }}
          >
            {track.trackType}
          </span>
        </div>
      ))}
      {remaining > 0 && (
        <div
          className="text-xs text-center py-1"
          style={{ color: 'var(--studio-text-subtle)' }}
        >
          + {remaining} more tracks
        </div>
      )}
    </div>
  );
}

function TemplateCard({
  template,
  isSelected,
  onClick,
  onDoubleClick,
  showDetails = false,
}: {
  template: StudioTemplate;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick?: () => void;
  showDetails?: boolean;
}) {
  const Icon = getCategoryIcon(template.icon);
  const audioTracks = template.tracks.filter((t) => t.trackType === 'audio').length;
  const midiTracks = template.tracks.filter((t) => t.trackType === 'midi' || t.trackType === 'instrument').length;
  const busTracks = template.tracks.filter((t) => t.trackType === 'bus').length;

  return (
    <div
      className={`relative p-4 rounded-lg cursor-pointer transition-all duration-200 border ${
        isSelected
          ? 'border-[var(--studio-accent)] shadow-lg'
          : 'border-[var(--studio-border-subtle)] hover:border-[var(--studio-border)]'
      }`}
      style={{
        backgroundColor: isSelected
          ? 'var(--studio-surface-elevated)'
          : 'var(--studio-surface)',
        boxShadow: isSelected
          ? '0 0 20px rgba(74, 158, 255, 0.15)'
          : undefined,
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      {isSelected && (
        <div
          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg, var(--studio-accent) 0%, var(--studio-accent-active) 100%)',
          }}
        >
          <Check className="w-3 h-3 text-white" />
        </div>
      )}

      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            backgroundColor: `${template.color}20`,
            border: `1px solid ${template.color}40`,
          }}
        >
          <Icon className="w-5 h-5" style={{ color: template.color }} />
        </div>

        <div className="flex-1 min-w-0">
          <h3
            className="font-semibold text-sm truncate"
            style={{ color: 'var(--studio-text)' }}
          >
            {template.name}
          </h3>
          <p
            className="text-xs mt-0.5 line-clamp-2"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            {template.description}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <div
          className="flex items-center gap-1 text-xs"
          style={{ color: 'var(--studio-text-subtle)' }}
        >
          <Layers className="w-3 h-3" />
          <span>{template.tracks.length} tracks</span>
        </div>
        <div
          className="flex items-center gap-1 text-xs"
          style={{ color: 'var(--studio-text-subtle)' }}
        >
          <Clock className="w-3 h-3" />
          <span>{template.tempo} BPM</span>
        </div>
        <div
          className="text-xs"
          style={{ color: 'var(--studio-text-subtle)' }}
        >
          {template.timeSignature}
        </div>
      </div>

      {showDetails && (
        <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--studio-border-subtle)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            {audioTracks > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0"
                style={{
                  borderColor: '#4ade8040',
                  color: '#4ade80',
                  backgroundColor: '#4ade8010',
                }}
              >
                {audioTracks} Audio
              </Badge>
            )}
            {midiTracks > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0"
                style={{
                  borderColor: '#a78bfa40',
                  color: '#a78bfa',
                  backgroundColor: '#a78bfa10',
                }}
              >
                {midiTracks} Instrument
              </Badge>
            )}
            {busTracks > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0"
                style={{
                  borderColor: '#8b5cf640',
                  color: '#8b5cf6',
                  backgroundColor: '#8b5cf610',
                }}
              >
                {busTracks} Bus
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplateDetails({ template }: { template: StudioTemplate }) {
  const Icon = getCategoryIcon(template.icon);

  return (
    <div
      className="h-full flex flex-col rounded-lg overflow-hidden"
      style={{ backgroundColor: 'var(--studio-bg-medium)' }}
    >
      <div
        className="p-4 border-b"
        style={{
          borderColor: 'var(--studio-border)',
          background: `linear-gradient(135deg, ${template.color}10 0%, transparent 100%)`,
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-lg flex items-center justify-center"
            style={{
              backgroundColor: `${template.color}25`,
              border: `1px solid ${template.color}50`,
            }}
          >
            <Icon className="w-6 h-6" style={{ color: template.color }} />
          </div>
          <div>
            <h2
              className="font-bold text-lg"
              style={{ color: 'var(--studio-text)' }}
            >
              {template.name}
            </h2>
            <Badge
              variant="outline"
              className="text-[10px] mt-1"
              style={{
                borderColor: `${template.color}40`,
                color: template.color,
                backgroundColor: `${template.color}10`,
              }}
            >
              {CATEGORY_INFO[template.category].name}
            </Badge>
          </div>
        </div>
        <p
          className="text-sm mt-3"
          style={{ color: 'var(--studio-text-muted)' }}
        >
          {template.description}
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          <div>
            <h3
              className="text-xs font-semibold uppercase mb-2 flex items-center gap-2"
              style={{ color: 'var(--studio-text-subtle)' }}
            >
              <Layers className="w-3.5 h-3.5" />
              Track Layout
            </h3>
            <TrackPreview tracks={template.tracks} maxDisplay={12} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--studio-bg-deep)' }}
            >
              <div
                className="text-xs font-medium"
                style={{ color: 'var(--studio-text-subtle)' }}
              >
                Tempo
              </div>
              <div
                className="text-lg font-bold mt-1"
                style={{ color: 'var(--studio-text)' }}
              >
                {template.tempo} <span className="text-xs font-normal">BPM</span>
              </div>
            </div>
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--studio-bg-deep)' }}
            >
              <div
                className="text-xs font-medium"
                style={{ color: 'var(--studio-text-subtle)' }}
              >
                Time Signature
              </div>
              <div
                className="text-lg font-bold mt-1"
                style={{ color: 'var(--studio-text)' }}
              >
                {template.timeSignature}
              </div>
            </div>
          </div>

          {template.useCases.length > 0 && (
            <div>
              <h3
                className="text-xs font-semibold uppercase mb-2 flex items-center gap-2"
                style={{ color: 'var(--studio-text-subtle)' }}
              >
                <Sparkles className="w-3.5 h-3.5" />
                Best For
              </h3>
              <ul className="space-y-1.5">
                {template.useCases.map((useCase, index) => (
                  <li
                    key={index}
                    className="flex items-center gap-2 text-sm"
                    style={{ color: 'var(--studio-text-muted)' }}
                  >
                    <ChevronRight className="w-3 h-3" style={{ color: template.color }} />
                    {useCase}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {template.tags.length > 0 && (
            <div>
              <h3
                className="text-xs font-semibold uppercase mb-2"
                style={{ color: 'var(--studio-text-subtle)' }}
              >
                Tags
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {template.tags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="text-[10px]"
                    style={{
                      backgroundColor: 'var(--studio-bg-light)',
                      color: 'var(--studio-text-muted)',
                    }}
                  >
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {template.isCommunity && template.author && (
            <div
              className="p-3 rounded-lg"
              style={{ backgroundColor: 'var(--studio-bg-deep)' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" style={{ color: 'var(--studio-text-subtle)' }} />
                  <span
                    className="text-sm"
                    style={{ color: 'var(--studio-text-muted)' }}
                  >
                    by {template.author}
                  </span>
                </div>
                {template.downloads !== undefined && (
                  <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--studio-text-subtle)' }}>
                    <Download className="w-3 h-3" />
                    {template.downloads.toLocaleString()}
                  </div>
                )}
              </div>
              {template.rating !== undefined && (
                <div className="flex items-center gap-1 mt-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className="w-3 h-3"
                      style={{
                        color: star <= template.rating! ? '#fbbf24' : 'var(--studio-text-subtle)',
                        fill: star <= template.rating! ? '#fbbf24' : 'none',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function SaveTemplateDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string, description: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim(), description.trim());
      setName('');
      setDescription('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md"
        style={{
          backgroundColor: 'var(--studio-bg-medium)',
          borderColor: 'var(--studio-border)',
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: 'var(--studio-text)' }}>
            Save as Template
          </DialogTitle>
          <DialogDescription style={{ color: 'var(--studio-text-muted)' }}>
            Save your current project configuration as a reusable template.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="template-name" style={{ color: 'var(--studio-text)' }}>
              Template Name
            </Label>
            <Input
              id="template-name"
              placeholder="My Custom Template"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{
                backgroundColor: 'var(--studio-bg-deep)',
                borderColor: 'var(--studio-border)',
                color: 'var(--studio-text)',
              }}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-description" style={{ color: 'var(--studio-text)' }}>
              Description (optional)
            </Label>
            <Textarea
              id="template-description"
              placeholder="Describe what this template is best used for..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              style={{
                backgroundColor: 'var(--studio-bg-deep)',
                borderColor: 'var(--studio-border)',
                color: 'var(--studio-text)',
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            style={{ color: 'var(--studio-text)' }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim()}
            className="studio-btn-accent"
          >
            <Save className="w-4 h-4 mr-2" />
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SmartTemplates({
  open,
  onOpenChange,
  onSelectTemplate,
  onSaveCustomTemplate,
  currentTracks,
  recentTemplateIds = [],
  customTemplates = [],
  communityTemplates = [],
}: SmartTemplatesProps) {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<StudioTemplate | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const allTemplates = useMemo(() => {
    return [...BUILT_IN_TEMPLATES, ...customTemplates, ...communityTemplates];
  }, [customTemplates, communityTemplates]);

  const recentTemplates = useMemo(() => {
    return recentTemplateIds
      .map((id) => allTemplates.find((t) => t.id === id))
      .filter((t): t is StudioTemplate => t !== undefined)
      .slice(0, 4);
  }, [recentTemplateIds, allTemplates]);

  const filteredTemplates = useMemo(() => {
    let templates = allTemplates;

    if (activeTab !== 'all' && activeTab !== 'recent') {
      templates = templates.filter((t) => t.category === activeTab);
    }

    if (searchQuery) {
      templates = filterTemplates(templates, { search: searchQuery });
    }

    return templates;
  }, [allTemplates, activeTab, searchQuery]);

  const handleSelectTemplate = () => {
    if (selectedTemplate) {
      onSelectTemplate(selectedTemplate);
      onOpenChange(false);
    }
  };

  const handleSaveTemplate = (name: string, description: string) => {
    if (onSaveCustomTemplate) {
      onSaveCustomTemplate(name, description);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-w-5xl max-h-[85vh] p-0 overflow-hidden"
          style={{
            backgroundColor: 'var(--studio-bg-deep)',
            borderColor: 'var(--studio-border)',
          }}
        >
          <div className="flex h-[75vh]">
            <div className="flex-1 flex flex-col border-r" style={{ borderColor: 'var(--studio-border)' }}>
              <div
                className="p-4 border-b"
                style={{ borderColor: 'var(--studio-border)' }}
              >
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle
                        className="text-xl font-bold flex items-center gap-2"
                        style={{ color: 'var(--studio-text)' }}
                      >
                        <Zap className="w-5 h-5" style={{ color: 'var(--studio-accent)' }} />
                        Smart Templates
                      </DialogTitle>
                      <DialogDescription style={{ color: 'var(--studio-text-muted)' }}>
                        Start with a pre-configured project template
                      </DialogDescription>
                    </div>
                    {onSaveCustomTemplate && currentTracks && currentTracks.length > 0 && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowSaveDialog(true)}
                              style={{
                                borderColor: 'var(--studio-border)',
                                color: 'var(--studio-text)',
                              }}
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Save Current
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Save current project as template</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </DialogHeader>

                <div className="relative mt-4">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: 'var(--studio-text-muted)' }}
                  />
                  <Input
                    placeholder="Search templates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    style={{
                      backgroundColor: 'var(--studio-bg-medium)',
                      borderColor: 'var(--studio-border)',
                      color: 'var(--studio-text)',
                    }}
                  />
                </div>
              </div>

              <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                className="flex-1 flex flex-col overflow-hidden"
              >
                <div
                  className="px-4 py-2 border-b overflow-x-auto"
                  style={{ borderColor: 'var(--studio-border)' }}
                >
                  <TabsList
                    className="inline-flex gap-1 h-auto p-1 rounded-lg"
                    style={{ backgroundColor: 'var(--studio-bg-medium)' }}
                  >
                    <TabsTrigger
                      value="all"
                      className="text-xs px-3 py-1.5 rounded data-[state=active]:bg-[var(--studio-surface-elevated)]"
                      style={{ color: 'var(--studio-text-muted)' }}
                    >
                      All
                    </TabsTrigger>
                    {recentTemplates.length > 0 && (
                      <TabsTrigger
                        value="recent"
                        className="text-xs px-3 py-1.5 rounded data-[state=active]:bg-[var(--studio-surface-elevated)]"
                        style={{ color: 'var(--studio-text-muted)' }}
                      >
                        <Clock className="w-3 h-3 mr-1" />
                        Recent
                      </TabsTrigger>
                    )}
                    {Object.entries(CATEGORY_INFO).map(([key, info]) => {
                      const CategoryIcon = getCategoryIcon(info.icon);
                      const count = allTemplates.filter((t) => t.category === key).length;
                      if (count === 0 && key !== 'custom' && key !== 'community') return null;

                      return (
                        <TabsTrigger
                          key={key}
                          value={key}
                          className="text-xs px-3 py-1.5 rounded data-[state=active]:bg-[var(--studio-surface-elevated)]"
                          style={{ color: 'var(--studio-text-muted)' }}
                        >
                          <CategoryIcon className="w-3 h-3 mr-1" />
                          {info.name}
                          {count > 0 && (
                            <span
                              className="ml-1 text-[10px]"
                              style={{ color: 'var(--studio-text-subtle)' }}
                            >
                              ({count})
                            </span>
                          )}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </div>

                <ScrollArea className="flex-1">
                  <TabsContent value="all" className="mt-0 p-4">
                    <div className="grid grid-cols-2 gap-3">
                      {filteredTemplates.map((template) => (
                        <TemplateCard
                          key={template.id}
                          template={template}
                          isSelected={selectedTemplate?.id === template.id}
                          onClick={() => setSelectedTemplate(template)}
                          onDoubleClick={handleSelectTemplate}
                          showDetails
                        />
                      ))}
                    </div>
                    {filteredTemplates.length === 0 && (
                      <div className="text-center py-12">
                        <Layers
                          className="w-12 h-12 mx-auto mb-4"
                          style={{ color: 'var(--studio-text-subtle)' }}
                        />
                        <p style={{ color: 'var(--studio-text-muted)' }}>
                          No templates found
                        </p>
                        <p
                          className="text-sm mt-1"
                          style={{ color: 'var(--studio-text-subtle)' }}
                        >
                          Try a different search term or category
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="recent" className="mt-0 p-4">
                    {recentTemplates.length > 0 ? (
                      <div className="grid grid-cols-2 gap-3">
                        {recentTemplates.map((template) => (
                          <TemplateCard
                            key={template.id}
                            template={template}
                            isSelected={selectedTemplate?.id === template.id}
                            onClick={() => setSelectedTemplate(template)}
                            onDoubleClick={handleSelectTemplate}
                            showDetails
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <Clock
                          className="w-12 h-12 mx-auto mb-4"
                          style={{ color: 'var(--studio-text-subtle)' }}
                        />
                        <p style={{ color: 'var(--studio-text-muted)' }}>
                          No recent templates
                        </p>
                        <p
                          className="text-sm mt-1"
                          style={{ color: 'var(--studio-text-subtle)' }}
                        >
                          Templates you use will appear here
                        </p>
                      </div>
                    )}
                  </TabsContent>

                  {Object.keys(CATEGORY_INFO).map((category) => (
                    <TabsContent key={category} value={category} className="mt-0 p-4">
                      {category === 'community' && communityTemplates.length === 0 ? (
                        <div className="text-center py-12">
                          <Users
                            className="w-12 h-12 mx-auto mb-4"
                            style={{ color: 'var(--studio-text-subtle)' }}
                          />
                          <p style={{ color: 'var(--studio-text-muted)' }}>
                            Community templates coming soon
                          </p>
                          <p
                            className="text-sm mt-1"
                            style={{ color: 'var(--studio-text-subtle)' }}
                          >
                            Share your templates with other producers
                          </p>
                          <Button
                            variant="outline"
                            className="mt-4"
                            disabled
                            style={{
                              borderColor: 'var(--studio-border)',
                              color: 'var(--studio-text-muted)',
                            }}
                          >
                            <TrendingUp className="w-4 h-4 mr-2" />
                            Browse Community
                          </Button>
                        </div>
                      ) : category === 'custom' && customTemplates.length === 0 ? (
                        <div className="text-center py-12">
                          <Star
                            className="w-12 h-12 mx-auto mb-4"
                            style={{ color: 'var(--studio-text-subtle)' }}
                          />
                          <p style={{ color: 'var(--studio-text-muted)' }}>
                            No custom templates yet
                          </p>
                          <p
                            className="text-sm mt-1"
                            style={{ color: 'var(--studio-text-subtle)' }}
                          >
                            Save your project configurations as templates
                          </p>
                          {onSaveCustomTemplate && currentTracks && currentTracks.length > 0 && (
                            <Button
                              variant="outline"
                              className="mt-4"
                              onClick={() => setShowSaveDialog(true)}
                              style={{
                                borderColor: 'var(--studio-border)',
                                color: 'var(--studio-text)',
                              }}
                            >
                              <Plus className="w-4 h-4 mr-2" />
                              Save Current Project
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {filteredTemplates
                            .filter((t) => t.category === category)
                            .map((template) => (
                              <TemplateCard
                                key={template.id}
                                template={template}
                                isSelected={selectedTemplate?.id === template.id}
                                onClick={() => setSelectedTemplate(template)}
                                onDoubleClick={handleSelectTemplate}
                                showDetails
                              />
                            ))}
                        </div>
                      )}
                    </TabsContent>
                  ))}
                </ScrollArea>
              </Tabs>
            </div>

            <div className="w-80 flex-shrink-0 flex flex-col">
              {selectedTemplate ? (
                <>
                  <TemplateDetails template={selectedTemplate} />
                  <div
                    className="p-4 border-t"
                    style={{ borderColor: 'var(--studio-border)' }}
                  >
                    <Button
                      className="w-full studio-btn-accent"
                      onClick={handleSelectTemplate}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Use This Template
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-8">
                  <div className="text-center">
                    <Layers
                      className="w-16 h-16 mx-auto mb-4"
                      style={{ color: 'var(--studio-text-subtle)' }}
                    />
                    <p style={{ color: 'var(--studio-text-muted)' }}>
                      Select a template to preview
                    </p>
                    <p
                      className="text-sm mt-1"
                      style={{ color: 'var(--studio-text-subtle)' }}
                    >
                      Double-click to use immediately
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <SaveTemplateDialog
        open={showSaveDialog}
        onOpenChange={setShowSaveDialog}
        onSave={handleSaveTemplate}
      />
    </>
  );
}

export default SmartTemplates;
