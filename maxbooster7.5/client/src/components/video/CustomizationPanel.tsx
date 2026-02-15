import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Type, 
  Palette, 
  Sparkles, 
  Music, 
  Upload, 
  X,
  Check,
  Wand2,
  RefreshCw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ColorPalette, AspectRatio } from '@/lib/video/templates';
import { DEFAULT_PALETTES, ASPECT_RATIOS } from '@/lib/video/templates';

interface CustomizationPanelProps {
  onTitleChange: (title: string) => void;
  onSubtitleChange: (subtitle: string) => void;
  onPaletteChange: (palette: ColorPalette) => void;
  onFontChange: (font: string) => void;
  onAspectRatioChange: (ratio: AspectRatio) => void;
  onEffectToggle: (effect: string, enabled: boolean) => void;
  onAudioUpload: (file: File) => void;
  onAudioRemove: () => void;
  title?: string;
  subtitle?: string;
  palette?: ColorPalette;
  font?: string;
  aspectRatio?: AspectRatio;
  effects?: Record<string, boolean>;
  audioFile?: File | null;
}

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter (Modern)' },
  { value: 'Roboto', label: 'Roboto (Clean)' },
  { value: 'Poppins', label: 'Poppins (Friendly)' },
  { value: 'Montserrat', label: 'Montserrat (Bold)' },
  { value: 'Playfair Display', label: 'Playfair (Elegant)' },
  { value: 'Oswald', label: 'Oswald (Condensed)' },
  { value: 'Bebas Neue', label: 'Bebas Neue (Impact)' },
  { value: 'Space Grotesk', label: 'Space Grotesk (Tech)' },
];

const EFFECT_OPTIONS = [
  { id: 'audioReactive', label: 'Audio Reactive', description: 'Elements react to music' },
  { id: 'particles', label: 'Particle Effects', description: 'Floating particles overlay' },
  { id: 'glow', label: 'Glow Effect', description: 'Add neon glow to elements' },
  { id: 'filmGrain', label: 'Film Grain', description: 'Vintage film texture' },
  { id: 'parallax', label: 'Parallax Motion', description: '3D depth movement' },
  { id: 'glitch', label: 'Glitch Effect', description: 'Digital glitch distortion' },
];

export function CustomizationPanel({
  onTitleChange,
  onSubtitleChange,
  onPaletteChange,
  onFontChange,
  onAspectRatioChange,
  onEffectToggle,
  onAudioUpload,
  onAudioRemove,
  title = '',
  subtitle = '',
  palette = DEFAULT_PALETTES.modern,
  font = 'Inter',
  aspectRatio = '16:9',
  effects = {},
  audioFile,
}: CustomizationPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [customColors, setCustomColors] = useState<Partial<ColorPalette>>({});
  const [activePreset, setActivePreset] = useState('modern');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('audio/')) {
      onAudioUpload(file);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
      onAudioUpload(file);
    }
  }, [onAudioUpload]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handlePresetSelect = (presetKey: string) => {
    setActivePreset(presetKey);
    const preset = DEFAULT_PALETTES[presetKey as keyof typeof DEFAULT_PALETTES];
    if (preset) {
      onPaletteChange(preset);
      setCustomColors({});
    }
  };

  const handleColorChange = (colorKey: keyof ColorPalette, value: string) => {
    const newCustomColors = { ...customColors, [colorKey]: value };
    setCustomColors(newCustomColors);
    onPaletteChange({ ...palette, ...newCustomColors });
  };

  const handleRandomize = () => {
    const keys = Object.keys(DEFAULT_PALETTES);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    handlePresetSelect(randomKey);
  };

  return (
    <Card className="h-full overflow-hidden flex flex-col">
      <CardHeader className="pb-3 border-b shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Customize</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleRandomize} className="gap-2">
            <Wand2 className="w-4 h-4" />
            Randomize
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto p-0">
        <Tabs defaultValue="text" className="h-full">
          <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0">
            <TabsTrigger 
              value="text" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 px-4"
            >
              <Type className="w-4 h-4 mr-2" />
              Text
            </TabsTrigger>
            <TabsTrigger 
              value="colors"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 px-4"
            >
              <Palette className="w-4 h-4 mr-2" />
              Colors
            </TabsTrigger>
            <TabsTrigger 
              value="effects"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 px-4"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Effects
            </TabsTrigger>
            <TabsTrigger 
              value="audio"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent py-3 px-4"
            >
              <Music className="w-4 h-4 mr-2" />
              Audio
            </TabsTrigger>
          </TabsList>

          <div className="p-4">
            <TabsContent value="text" className="mt-0 space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="Enter your title..."
                  value={title}
                  onChange={(e) => onTitleChange(e.target.value)}
                  className="text-lg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subtitle">Subtitle</Label>
                <Input
                  id="subtitle"
                  placeholder="Enter subtitle or tagline..."
                  value={subtitle}
                  onChange={(e) => onSubtitleChange(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Font Family</Label>
                <Select value={font} onValueChange={onFontChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        <span style={{ fontFamily: f.value }}>{f.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Aspect Ratio</Label>
                <Select value={aspectRatio} onValueChange={(v) => onAspectRatioChange(v as AspectRatio)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ASPECT_RATIOS).map(([ratio, config]) => (
                      <SelectItem key={ratio} value={ratio}>
                        <div className="flex items-center gap-2">
                          <div 
                            className="border rounded"
                            style={{
                              width: ratio === '9:16' ? 12 : ratio === '1:1' ? 16 : 20,
                              height: ratio === '9:16' ? 20 : ratio === '1:1' ? 16 : 12,
                            }}
                          />
                          <span>{ratio} - {config.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="colors" className="mt-0 space-y-6">
              <div className="space-y-3">
                <Label>Color Presets</Label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(DEFAULT_PALETTES).map(([key, p]) => (
                    <motion.button
                      key={key}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handlePresetSelect(key)}
                      className={`relative p-3 rounded-lg border-2 transition-colors ${
                        activePreset === key 
                          ? 'border-primary' 
                          : 'border-transparent hover:border-muted-foreground/30'
                      }`}
                    >
                      <div className="flex gap-1 justify-center mb-2">
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: p.primary }}
                        />
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: p.secondary }}
                        />
                        <div 
                          className="w-4 h-4 rounded-full" 
                          style={{ backgroundColor: p.accent }}
                        />
                      </div>
                      <span className="text-xs capitalize">{key}</span>
                      {activePreset === key && (
                        <Check className="absolute top-1 right-1 w-3 h-3 text-primary" />
                      )}
                    </motion.button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <Label>Custom Colors</Label>
                
                {[
                  { key: 'primary', label: 'Primary' },
                  { key: 'secondary', label: 'Secondary' },
                  { key: 'accent', label: 'Accent' },
                  { key: 'background', label: 'Background' },
                  { key: 'text', label: 'Text' },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <input
                      type="color"
                      value={palette[key as keyof ColorPalette]}
                      onChange={(e) => handleColorChange(key as keyof ColorPalette, e.target.value)}
                      className="w-10 h-10 rounded-lg cursor-pointer border-2 border-muted"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{label}</div>
                      <div className="text-xs text-muted-foreground uppercase">
                        {palette[key as keyof ColorPalette]}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="effects" className="mt-0 space-y-4">
              {EFFECT_OPTIONS.map((effect) => (
                <div 
                  key={effect.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">{effect.label}</div>
                    <div className="text-xs text-muted-foreground">{effect.description}</div>
                  </div>
                  <Switch
                    checked={effects[effect.id] || false}
                    onCheckedChange={(checked) => onEffectToggle(effect.id, checked)}
                  />
                </div>
              ))}

              <div className="space-y-3 pt-4 border-t">
                <Label>Effect Intensity</Label>
                <Slider
                  defaultValue={[50]}
                  max={100}
                  step={1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtle</span>
                  <span>Intense</span>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="audio" className="mt-0 space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileChange}
                className="hidden"
              />

              <AnimatePresence mode="wait">
                {audioFile ? (
                  <motion.div
                    key="audio-file"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                        <Music className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{audioFile.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={onAudioRemove}
                        className="shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="upload-zone"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-8 rounded-lg border-2 border-dashed cursor-pointer transition-all ${
                      isDragging
                        ? 'border-primary bg-primary/10'
                        : 'border-muted-foreground/30 hover:border-primary hover:bg-accent/50'
                    }`}
                  >
                    <div className="text-center">
                      <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                      <div className="text-sm font-medium">Upload Audio</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Drag & drop or click to browse
                      </div>
                      <div className="text-xs text-muted-foreground mt-2">
                        MP3, WAV, AAC up to 50MB
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="p-4 rounded-lg bg-muted/50">
                <h4 className="text-sm font-medium mb-2">Audio Tips</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Use high-quality audio for best results</li>
                  <li>• Enable "Audio Reactive" in Effects for dynamic visuals</li>
                  <li>• Video duration will match audio length</li>
                  <li>• Supported formats: MP3, WAV, AAC, OGG</li>
                </ul>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
