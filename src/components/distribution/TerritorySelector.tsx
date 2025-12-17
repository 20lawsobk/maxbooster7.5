import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Globe, Search, X } from 'lucide-react';

// ISO 3166-1 alpha-2 country codes with names
const TERRITORIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'IE', name: 'Ireland' },
  { code: 'PT', name: 'Portugal' },
  { code: 'AT', name: 'Austria' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'PL', name: 'Poland' },
  { code: 'CZ', name: 'Czech Republic' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' },
  { code: 'AR', name: 'Argentina' },
  { code: 'CL', name: 'Chile' },
  { code: 'CO', name: 'Colombia' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'CN', name: 'China' },
  { code: 'IN', name: 'India' },
  { code: 'SG', name: 'Singapore' },
  { code: 'MY', name: 'Malaysia' },
  { code: 'TH', name: 'Thailand' },
  { code: 'ID', name: 'Indonesia' },
  { code: 'PH', name: 'Philippines' },
  { code: 'VN', name: 'Vietnam' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'KE', name: 'Kenya' },
  { code: 'EG', name: 'Egypt' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'IL', name: 'Israel' },
  { code: 'TR', name: 'Turkey' },
  { code: 'RU', name: 'Russia' },
  { code: 'NZ', name: 'New Zealand' },
].sort((a, b) => a.name.localeCompare(b.name));

const REGIONS = [
  { id: 'north-america', name: 'North America', countries: ['US', 'CA', 'MX'] },
  {
    id: 'europe',
    name: 'Europe',
    countries: [
      'GB',
      'DE',
      'FR',
      'ES',
      'IT',
      'NL',
      'BE',
      'SE',
      'NO',
      'DK',
      'FI',
      'IE',
      'PT',
      'AT',
      'CH',
      'PL',
      'CZ',
    ],
  },
  {
    id: 'asia',
    name: 'Asia',
    countries: ['JP', 'KR', 'CN', 'IN', 'SG', 'MY', 'TH', 'ID', 'PH', 'VN'],
  },
  { id: 'latin-america', name: 'Latin America', countries: ['BR', 'AR', 'CL', 'CO', 'MX'] },
  { id: 'middle-east', name: 'Middle East', countries: ['SA', 'AE', 'IL', 'TR', 'EG'] },
  { id: 'africa', name: 'Africa', countries: ['ZA', 'NG', 'KE', 'EG'] },
  { id: 'oceania', name: 'Oceania', countries: ['AU', 'NZ'] },
];

interface TerritorySelectorProps {
  selectedTerritories: string[];
  onChange: (territories: string[]) => void;
  mode: 'worldwide' | 'include' | 'exclude';
  onModeChange: (mode: 'worldwide' | 'include' | 'exclude') => void;
}

/**
 * TODO: Add function documentation
 */
export function TerritorySelector({
  selectedTerritories,
  onChange,
  mode,
  onModeChange,
}: TerritorySelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTerritories = TERRITORIES.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleTerritory = (code: string) => {
    if (selectedTerritories.includes(code)) {
      onChange(selectedTerritories.filter((c) => c !== code));
    } else {
      onChange([...selectedTerritories, code]);
    }
  };

  const selectRegion = (regionId: string) => {
    const region = REGIONS.find((r) => r.id === regionId);
    if (!region) return;

    const newTerritories = [...selectedTerritories];
    region.countries.forEach((code) => {
      if (!newTerritories.includes(code)) {
        newTerritories.push(code);
      }
    });
    onChange(newTerritories);
  };

  const selectAll = () => {
    onChange(TERRITORIES.map((t) => t.code));
  };

  const clearAll = () => {
    onChange([]);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Globe className="h-5 w-5" />
          Territory Selection
        </CardTitle>
        <CardDescription>
          Choose where your release will be available. Most artists select Worldwide.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mode Selection */}
        <div className="space-y-3">
          <Label>Distribution Mode</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              type="button"
              className={`p-4 border-2 rounded-lg text-left transition-colors ${
                mode === 'worldwide'
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-primary/50'
              }`}
              onClick={() => {
                onModeChange('worldwide');
                onChange([]);
              }}
            >
              <div className="font-medium mb-1">Worldwide</div>
              <div className="text-xs text-muted-foreground">All territories (recommended)</div>
            </button>

            <button
              type="button"
              className={`p-4 border-2 rounded-lg text-left transition-colors ${
                mode === 'include'
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-primary/50'
              }`}
              onClick={() => onModeChange('include')}
            >
              <div className="font-medium mb-1">Specific Territories</div>
              <div className="text-xs text-muted-foreground">Select countries to include</div>
            </button>

            <button
              type="button"
              className={`p-4 border-2 rounded-lg text-left transition-colors ${
                mode === 'exclude'
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-primary/50'
              }`}
              onClick={() => onModeChange('exclude')}
            >
              <div className="font-medium mb-1">Exclude Territories</div>
              <div className="text-xs text-muted-foreground">Worldwide except selected</div>
            </button>
          </div>
        </div>

        {mode !== 'worldwide' && (
          <>
            {/* Quick Region Selection */}
            <div className="space-y-2">
              <Label>Quick Region Selection</Label>
              <div className="flex flex-wrap gap-2">
                {REGIONS.map((region) => (
                  <Button
                    key={region.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => selectRegion(region.id)}
                  >
                    {region.name}
                  </Button>
                ))}
              </div>
            </div>

            {/* Selected Count and Actions */}
            <div className="flex items-center justify-between">
              <div className="text-sm">
                {mode === 'include' ? 'Including' : 'Excluding'}{' '}
                <strong>{selectedTerritories.length}</strong> territories
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectAll}>
                  Select All
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={clearAll}>
                  Clear All
                </Button>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search territories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Selected Territories */}
            {selectedTerritories.length > 0 && (
              <div className="space-y-2">
                <Label>Selected Territories</Label>
                <div className="flex flex-wrap gap-2">
                  {selectedTerritories.map((code) => {
                    const territory = TERRITORIES.find((t) => t.code === code);
                    return (
                      <Badge
                        key={code}
                        variant="secondary"
                        className="cursor-pointer hover:bg-destructive/80 hover:text-destructive-foreground"
                        onClick={() => toggleTerritory(code)}
                      >
                        {territory?.name || code}
                        <X className="h-3 w-3 ml-1" />
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Territory List */}
            <div className="space-y-2">
              <Label>Available Territories</Label>
              <div className="border rounded-lg max-h-64 overflow-y-auto">
                <div className="p-2 space-y-1">
                  {filteredTerritories.map((territory) => (
                    <div
                      key={territory.code}
                      className="flex items-center gap-3 p-2 hover:bg-muted/50 rounded cursor-pointer"
                      onClick={() => toggleTerritory(territory.code)}
                    >
                      <Checkbox
                        checked={selectedTerritories.includes(territory.code)}
                        onCheckedChange={() => toggleTerritory(territory.code)}
                      />
                      <div className="flex-1">
                        <span className="font-medium">{territory.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{territory.code}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {mode === 'worldwide' && (
          <div className="text-center py-8 text-muted-foreground">
            <Globe className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Worldwide Distribution Selected</p>
            <p className="text-sm">Your release will be available in all territories</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
