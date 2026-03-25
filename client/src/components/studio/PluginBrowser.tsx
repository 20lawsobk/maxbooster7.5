import { logger } from '@/lib/logger';
import { useState, useEffect, useMemo } from 'react';
import { X, Search, Grid, List, Music, Sliders, ChevronRight, Loader2 } from 'lucide-react';
import type { PluginDefinition } from './PluginDialog';

interface PluginBrowserProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (plugin: PluginDefinition) => void;
  filterCategory?: 'instrument' | 'effect' | null;
}

const EFFECT_TYPES = [
  { type: 'reverb', name: 'Reverb', icon: '🏛️' },
  { type: 'delay', name: 'Delay', icon: '📡' },
  { type: 'chorus', name: 'Chorus', icon: '🌊' },
  { type: 'compressor', name: 'Compressor', icon: '📉' },
  { type: 'eq', name: 'Equalizer', icon: '📊' },
  { type: 'limiter', name: 'Limiter', icon: '🧱' },
  { type: 'gate', name: 'Gate', icon: '🚪' },
  { type: 'distortion', name: 'Distortion', icon: '🔥' },
  { type: 'phaser', name: 'Phaser', icon: '🌀' },
  { type: 'flanger', name: 'Flanger', icon: '✈️' },
];

const INSTRUMENT_TYPES = [
  { type: 'piano', name: 'Piano', icon: '🎹' },
  { type: 'strings', name: 'Strings', icon: '🎻' },
  { type: 'drums', name: 'Drums', icon: '🥁' },
  { type: 'bass', name: 'Bass', icon: '🔊' },
  { type: 'pad', name: 'Pads', icon: '☁️' },
  { type: 'synth', name: 'Synth', icon: '🎛️' },
  { type: 'analog', name: 'Analog', icon: '🔶' },
  { type: 'fm', name: 'FM', icon: '📟' },
  { type: 'wavetable', name: 'Wavetable', icon: '🌊' },
  { type: 'sampler', name: 'Sampler', icon: '🎵' },
];

export function PluginBrowser({ isOpen, onClose, onSelect, filterCategory }: PluginBrowserProps) {
  const [plugins, setPlugins] = useState<Record<string, PluginDefinition[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'instrument' | 'effect'>('effect');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  useEffect(() => {
    if (filterCategory) {
      setSelectedCategory(filterCategory);
    }
  }, [filterCategory]);
  
  useEffect(() => {
    if (!isOpen) return;
    
    const fetchPlugins = async () => {
      try {
        setLoading(true);
        const response = await fetch('/api/studio/plugins');
        if (response.ok) {
          const data = await response.json();
          setPlugins(data);
        }
      } catch (error) {
        logger.error('Failed to fetch plugins:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchPlugins();
  }, [isOpen]);
  
  const filteredPlugins = useMemo(() => {
    const allPlugins: PluginDefinition[] = [];
    
    Object.values(plugins).forEach(group => {
      group.forEach(plugin => {
        if (plugin.category === selectedCategory) {
          if (selectedType && plugin.type !== selectedType) return;
          if (search && !plugin.name.toLowerCase().includes(search.toLowerCase()) && 
              !plugin.description.toLowerCase().includes(search.toLowerCase())) return;
          allPlugins.push(plugin);
        }
      });
    });
    
    return allPlugins;
  }, [plugins, selectedCategory, selectedType, search]);
  
  const typesList = selectedCategory === 'instrument' ? INSTRUMENT_TYPES : EFFECT_TYPES;
  
  const getTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      reverb: '#8b5cf6', delay: '#3b82f6', chorus: '#06b6d4', flanger: '#06b6d4',
      phaser: '#f59e0b', compressor: '#10b981', eq: '#3b82f6', limiter: '#ef4444',
      gate: '#6366f1', distortion: '#ef4444', piano: '#1e1e1e', strings: '#8b5cf6',
      drums: '#ef4444', bass: '#f97316', pad: '#a855f7', synth: '#f59e0b',
      analog: '#f59e0b', fm: '#3b82f6', wavetable: '#8b5cf6', sampler: '#06b6d4',
    };
    return colors[type] || '#64748b';
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-slate-900 rounded-xl border border-slate-700 shadow-2xl w-[900px] h-[600px] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold text-white">Plugin Browser</h2>
            <div className="flex rounded-lg bg-slate-800 p-0.5">
              <button
                onClick={() => { setSelectedCategory('effect'); setSelectedType(null); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
                  selectedCategory === 'effect' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Sliders className="w-4 h-4" />
                Effects
              </button>
              <button
                onClick={() => { setSelectedCategory('instrument'); setSelectedType(null); }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-all ${
                  selectedCategory === 'instrument' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Music className="w-4 h-4" />
                Instruments
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search plugins..."
                className="pl-9 pr-4 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-slate-600 w-48"
              />
            </div>
            
            <div className="flex rounded-lg bg-slate-800 p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
              >
                <Grid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
            
            <button onClick={onClose} className="p-1.5 rounded bg-slate-800 text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <div className="flex flex-1 overflow-hidden">
          <div className="w-44 border-r border-slate-700 p-2 overflow-y-auto">
            <button
              onClick={() => setSelectedType(null)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                !selectedType ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span className="text-base">🎛️</span>
              All {selectedCategory === 'instrument' ? 'Instruments' : 'Effects'}
            </button>
            
            <div className="h-px bg-slate-700 my-2" />
            
            {typesList.map(({ type, name, icon }) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                  selectedType === type ? 'bg-slate-700 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <span className="text-base">{icon}</span>
                {name}
              </button>
            ))}
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm">Scanning plugins...</span>
              </div>
            ) : filteredPlugins.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-500">
                No plugins found
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-3 gap-3">
                {filteredPlugins.map((plugin) => (
                  <button
                    key={plugin.id}
                    onClick={() => onSelect(plugin)}
                    className="flex flex-col p-3 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 hover:border-slate-600 transition-all text-left group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: getTypeColor(plugin.type) }}
                          />
                          <span className="text-sm font-medium text-white group-hover:text-emerald-400 transition-colors">
                            {plugin.name}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-1 line-clamp-2">{plugin.description}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 flex-shrink-0" />
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span 
                        className="text-[9px] px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: `${getTypeColor(plugin.type)}20`, color: getTypeColor(plugin.type) }}
                      >
                        {plugin.type}
                      </span>
                      <span className="text-[9px] text-slate-600">{plugin.parameters.length} params</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredPlugins.map((plugin) => (
                  <button
                    key={plugin.id}
                    onClick={() => onSelect(plugin)}
                    className="w-full flex items-center gap-3 p-2 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 hover:border-slate-600 transition-all text-left group"
                  >
                    <div 
                      className="w-2 h-8 rounded-full"
                      style={{ backgroundColor: getTypeColor(plugin.type) }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-white group-hover:text-emerald-400">{plugin.name}</span>
                      <p className="text-[10px] text-slate-500 truncate">{plugin.description}</p>
                    </div>
                    <span 
                      className="text-[9px] px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{ backgroundColor: `${getTypeColor(plugin.type)}20`, color: getTypeColor(plugin.type) }}
                    >
                      {plugin.type}
                    </span>
                    <span className="text-[9px] text-slate-600 flex-shrink-0">{plugin.parameters.length} params</span>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="px-4 py-2 border-t border-slate-700 bg-slate-800/50 rounded-b-xl">
          <div className="flex items-center justify-between text-[10px] text-slate-500">
            <span>{filteredPlugins.length} plugins available</span>
            <span>Double-click to add to selected track</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PluginBrowser;
