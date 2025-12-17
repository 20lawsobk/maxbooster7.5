import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Music, Info } from 'lucide-react';

const GENRES = [
  'Pop',
  'Rock',
  'Hip-Hop',
  'R&B',
  'Country',
  'Electronic',
  'Jazz',
  'Classical',
  'Blues',
  'Reggae',
  'Folk',
  'Alternative',
  'Indie',
  'Punk',
  'Metal',
  'Funk',
  'Soul',
  'Gospel',
  'World',
  'Latin',
  'Ambient',
  'Experimental',
  'Lo-Fi',
];

const LANGUAGES = [
  'English',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Japanese',
  'Korean',
  'Mandarin',
  'Arabic',
  'Russian',
  'Hindi',
  'Other',
];

const RELEASE_TYPES = [
  { value: 'single', label: 'Single' },
  { value: 'EP', label: 'EP (4-6 tracks)' },
  { value: 'album', label: 'Album (7+ tracks)' },
];

const MOOD_TAGS = [
  'Energetic',
  'Relaxed',
  'Happy',
  'Sad',
  'Angry',
  'Romantic',
  'Dark',
  'Uplifting',
  'Melancholic',
  'Aggressive',
  'Peaceful',
  'Mysterious',
  'Epic',
  'Dreamy',
  'Party',
];

interface MetadataFormProps {
  data: {
    title: string;
    artistName: string;
    releaseType: 'single' | 'EP' | 'album';
    primaryGenre: string;
    secondaryGenre: string;
    language: string;
    labelName: string;
    copyrightYear: number;
    copyrightOwner: string;
    publishingRights: string;
    isExplicit: boolean;
    moodTags: string[];
  };
  onChange: (updates: Partial<MetadataFormProps['data']>) => void;
  errors?: Record<string, string>;
}

/**
 * TODO: Add function documentation
 */
export function MetadataForm({ data, onChange, errors = {} }: MetadataFormProps) {
  const [selectedMoods, setSelectedMoods] = useState<string[]>(data.moodTags || []);

  const toggleMood = (mood: string) => {
    const newMoods = selectedMoods.includes(mood)
      ? selectedMoods.filter((m) => m !== mood)
      : [...selectedMoods, mood];
    setSelectedMoods(newMoods);
    onChange({ moodTags: newMoods });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music className="h-5 w-5" />
          Release Information
        </CardTitle>
        <CardDescription>
          Enter the basic details about your release. All fields are required.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Release Title */}
        <div className="space-y-2">
          <Label htmlFor="title">
            Release Title <span className="text-destructive">*</span>
          </Label>
          <Input
            id="title"
            placeholder="Enter release title"
            value={data.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className={errors.title ? 'border-destructive' : ''}
          />
          {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
        </div>

        {/* Artist Name */}
        <div className="space-y-2">
          <Label htmlFor="artistName">
            Artist Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="artistName"
            placeholder="Enter primary artist name"
            value={data.artistName}
            onChange={(e) => onChange({ artistName: e.target.value })}
            className={errors.artistName ? 'border-destructive' : ''}
          />
          {errors.artistName && <p className="text-sm text-destructive">{errors.artistName}</p>}
        </div>

        {/* Release Type */}
        <div className="space-y-2">
          <Label htmlFor="releaseType">
            Release Type <span className="text-destructive">*</span>
          </Label>
          <Select
            value={data.releaseType}
            onValueChange={(value: 'single' | 'EP' | 'album') => onChange({ releaseType: value })}
          >
            <SelectTrigger id="releaseType">
              <SelectValue placeholder="Select release type" />
            </SelectTrigger>
            <SelectContent>
              {RELEASE_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  {type.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.releaseType && <p className="text-sm text-destructive">{errors.releaseType}</p>}
        </div>

        {/* Genres */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="primaryGenre">
              Primary Genre <span className="text-destructive">*</span>
            </Label>
            <Select
              value={data.primaryGenre}
              onValueChange={(value) => onChange({ primaryGenre: value })}
            >
              <SelectTrigger id="primaryGenre">
                <SelectValue placeholder="Select primary genre" />
              </SelectTrigger>
              <SelectContent>
                {GENRES.map((genre) => (
                  <SelectItem key={genre} value={genre}>
                    {genre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.primaryGenre && (
              <p className="text-sm text-destructive">{errors.primaryGenre}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="secondaryGenre">Secondary Genre (Optional)</Label>
            <Select
              value={data.secondaryGenre}
              onValueChange={(value) => onChange({ secondaryGenre: value })}
            >
              <SelectTrigger id="secondaryGenre">
                <SelectValue placeholder="Select secondary genre" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {GENRES.map((genre) => (
                  <SelectItem key={genre} value={genre}>
                    {genre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Language */}
        <div className="space-y-2">
          <Label htmlFor="language">
            Language <span className="text-destructive">*</span>
          </Label>
          <Select value={data.language} onValueChange={(value) => onChange({ language: value })}>
            <SelectTrigger id="language">
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Mood Tags */}
        <div className="space-y-2">
          <Label>Mood Tags (Select up to 5)</Label>
          <p className="text-sm text-muted-foreground">
            Help listeners find your music with mood descriptors
          </p>
          <div className="flex flex-wrap gap-2 mt-2">
            {MOOD_TAGS.map((mood) => (
              <Badge
                key={mood}
                variant={selectedMoods.includes(mood) ? 'default' : 'outline'}
                className="cursor-pointer hover:bg-primary/80"
                onClick={() =>
                  selectedMoods.length < 5 || selectedMoods.includes(mood) ? toggleMood(mood) : null
                }
              >
                {mood}
              </Badge>
            ))}
          </div>
        </div>

        {/* Copyright Information */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="font-medium flex items-center gap-2">
            <Info className="h-4 w-4" />
            Copyright & Publishing
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="copyrightYear">
                Copyright Year <span className="text-destructive">*</span>
              </Label>
              <Input
                id="copyrightYear"
                type="number"
                min={1900}
                max={new Date().getFullYear() + 1}
                value={data.copyrightYear}
                onChange={(e) => onChange({ copyrightYear: parseInt(e.target.value) })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="copyrightOwner">
                Copyright Owner <span className="text-destructive">*</span>
              </Label>
              <Input
                id="copyrightOwner"
                placeholder="e.g., Your Name or Label"
                value={data.copyrightOwner}
                onChange={(e) => onChange({ copyrightOwner: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="labelName">Label Name (Optional)</Label>
            <Input
              id="labelName"
              placeholder="Leave blank for Independent"
              value={data.labelName}
              onChange={(e) => onChange({ labelName: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="publishingRights">Publishing Rights</Label>
            <Input
              id="publishingRights"
              value={data.publishingRights}
              onChange={(e) => onChange({ publishingRights: e.target.value })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
