import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Volume2,
  VolumeX,
  Headphones,
  Mic,
  Power,
  Settings2,
  ChevronDown,
  ChevronRight,
  Trash2,
  Copy,
  RotateCcw,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProfessionalFader } from './ProfessionalFader';
import { Knob } from './Knob';
import { VUMeter } from './VUMeter';

interface InsertPlugin {
  id: string;
  name: string;
  type: 'eq' | 'compressor' | 'reverb' | 'delay' | 'chorus' | 'distortion' | 'other';
  bypass: boolean;
  params?: Record<string, number | boolean | string>;
}

interface SendLevel {
  busId: string;
  busName: string;
  level: number;
  preFader: boolean;
  mute: boolean;
}

interface IOAssignment {
  input: string;
  output: string;
  inputOptions: string[];
  outputOptions: string[];
}

interface ChannelOverviewProps {
  trackId: string;
  trackName: string;
  trackColor: string;
  trackType: 'audio' | 'midi' | 'instrument' | 'bus' | 'master';
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  armed?: boolean;
  inserts: InsertPlugin[];
  sends: SendLevel[];
  io: IOAssignment;
  meterLevel?: number;
  peakLevel?: number;
  isOpen: boolean;
  position?: { x: number; y: number };
  onClose: () => void;
  onVolumeChange: (volume: number) => void;
  onPanChange: (pan: number) => void;
  onMuteToggle: () => void;
  onSoloToggle: () => void;
  onArmedToggle?: () => void;
  onInsertBypassToggle: (insertId: string) => void;
  onInsertRemove?: (insertId: string) => void;
  onSendLevelChange: (busId: string, level: number) => void;
  onSendMuteToggle?: (busId: string) => void;
  onSendPreFaderToggle?: (busId: string) => void;
  onIOChange?: (type: 'input' | 'output', value: string) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  onResetChannel?: () => void;
}

interface CollapsibleSectionProps {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, icon, defaultOpen = true, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border-b" style={{ borderColor: 'var(--studio-border)' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors"
        style={{ background: 'var(--studio-bg-medium)' }}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-xs font-medium" style={{ color: 'var(--studio-text)' }}>
            {title}
          </span>
        </div>
        <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={{ duration: 0.2 }}>
          <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3" style={{ background: 'var(--studio-bg-deep)' }}>
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function ChannelOverview({
  trackId,
  trackName,
  trackColor,
  trackType,
  volume,
  pan,
  mute,
  solo,
  armed = false,
  inserts,
  sends,
  io,
  meterLevel = -60,
  peakLevel = -60,
  isOpen,
  position,
  onClose,
  onVolumeChange,
  onPanChange,
  onMuteToggle,
  onSoloToggle,
  onArmedToggle,
  onInsertBypassToggle,
  onInsertRemove,
  onSendLevelChange,
  onSendMuteToggle,
  onSendPreFaderToggle,
  onIOChange,
  onDuplicate,
  onDelete,
  onResetChannel,
}: ChannelOverviewProps) {
  const [localMeterLevel, setLocalMeterLevel] = useState(meterLevel);
  const [localPeakLevel, setLocalPeakLevel] = useState(peakLevel);

  useEffect(() => {
    if (mute) {
      setLocalMeterLevel(-60);
      setLocalPeakLevel(-60);
      return;
    }

    const interval = setInterval(() => {
      const baseLevel = -20 + (Math.random() * 15 - 7.5);
      const newLevel = baseLevel * volume;
      setLocalMeterLevel(newLevel);
      setLocalPeakLevel((prev) => Math.max(prev - 0.5, newLevel));
    }, 50);

    return () => clearInterval(interval);
  }, [volume, mute]);

  const getTrackTypeIcon = () => {
    switch (trackType) {
      case 'audio':
        return <Volume2 className="h-4 w-4" style={{ color: trackColor }} />;
      case 'midi':
        return <Layers className="h-4 w-4" style={{ color: trackColor }} />;
      case 'instrument':
        return <Mic className="h-4 w-4" style={{ color: trackColor }} />;
      case 'bus':
        return <ArrowDownToLine className="h-4 w-4" style={{ color: trackColor }} />;
      case 'master':
        return <Settings2 className="h-4 w-4" style={{ color: trackColor }} />;
      default:
        return <Volume2 className="h-4 w-4" style={{ color: trackColor }} />;
    }
  };

  const getPluginTypeColor = (type: InsertPlugin['type']) => {
    const colors: Record<InsertPlugin['type'], string> = {
      eq: '#3498db',
      compressor: '#e74c3c',
      reverb: '#9b59b6',
      delay: '#2ecc71',
      chorus: '#f39c12',
      distortion: '#e67e22',
      other: '#95a5a6',
    };
    return colors[type];
  };

  const formatDb = (value: number) => {
    if (value <= 0) return '-∞';
    const db = 20 * Math.log10(value);
    return db.toFixed(1);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed z-50 shadow-2xl rounded-lg overflow-hidden"
        style={{
          left: position?.x ?? '50%',
          top: position?.y ?? '50%',
          transform: position ? 'none' : 'translate(-50%, -50%)',
          width: '380px',
          maxHeight: '80vh',
          background: 'var(--studio-bg-deep)',
          border: '1px solid var(--studio-border)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.2 }}
      >
        <div
          className="h-2 w-full"
          style={{ background: trackColor }}
        />

        <div
          className="px-4 py-3 flex items-center justify-between border-b"
          style={{ borderColor: 'var(--studio-border)', background: 'var(--studio-bg-medium)' }}
        >
          <div className="flex items-center gap-3">
            {getTrackTypeIcon()}
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--studio-text)' }}>
                {trackName}
              </h3>
              <span className="text-[10px] uppercase" style={{ color: 'var(--studio-text-muted)' }}>
                {trackType} Channel
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-white/10"
              onClick={onDuplicate}
              title="Duplicate Track"
            >
              <Copy className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-white/10"
              onClick={onResetChannel}
              title="Reset Channel"
            >
              <RotateCcw className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-red-500/20"
              onClick={onClose}
            >
              <X className="h-4 w-4" style={{ color: 'var(--studio-text)' }} />
            </Button>
          </div>
        </div>

        <ScrollArea className="max-h-[calc(80vh-100px)]">
          <CollapsibleSection
            title="Level & Pan"
            icon={<Volume2 className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />}
            defaultOpen={true}
          >
            <div className="flex items-start gap-6">
              <div className="flex flex-col items-center gap-2">
                <VUMeter
                  level={localMeterLevel}
                  peak={localPeakLevel}
                  width={120}
                  height={40}
                  style="modern"
                  showScale={false}
                />
                <ProfessionalFader
                  value={volume}
                  onChange={onVolumeChange}
                  height={120}
                  showMeter={true}
                  meterLevel={localMeterLevel}
                  peakLevel={localPeakLevel}
                />
                <span className="text-[10px] font-mono" style={{ color: 'var(--studio-text-muted)' }}>
                  {formatDb(volume)} dB
                </span>
              </div>

              <div className="flex-1 space-y-4">
                <div className="flex flex-col items-center">
                  <Knob
                    value={pan}
                    onChange={onPanChange}
                    label="PAN"
                    size={56}
                    min={-1}
                    max={1}
                    defaultValue={0}
                    bipolar={true}
                    color={trackColor}
                  />
                </div>

                <div className="flex flex-wrap gap-2 justify-center">
                  <Button
                    size="sm"
                    variant={mute ? 'destructive' : 'outline'}
                    className="h-8 px-3 text-xs font-bold"
                    onClick={onMuteToggle}
                    style={{
                      background: mute ? '#ef4444' : 'transparent',
                      borderColor: mute ? '#ef4444' : 'var(--studio-border)',
                    }}
                  >
                    <VolumeX className="h-3 w-3 mr-1" />
                    MUTE
                  </Button>
                  <Button
                    size="sm"
                    variant={solo ? 'default' : 'outline'}
                    className="h-8 px-3 text-xs font-bold"
                    onClick={onSoloToggle}
                    style={{
                      background: solo ? '#fbbf24' : 'transparent',
                      borderColor: solo ? '#fbbf24' : 'var(--studio-border)',
                      color: solo ? '#000' : 'var(--studio-text)',
                    }}
                  >
                    <Headphones className="h-3 w-3 mr-1" />
                    SOLO
                  </Button>
                  {trackType === 'audio' && onArmedToggle && (
                    <Button
                      size="sm"
                      variant={armed ? 'default' : 'outline'}
                      className="h-8 px-3 text-xs font-bold"
                      onClick={onArmedToggle}
                      style={{
                        background: armed ? '#ef4444' : 'transparent',
                        borderColor: armed ? '#ef4444' : 'var(--studio-border)',
                      }}
                    >
                      <Mic className="h-3 w-3 mr-1" />
                      ARM
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title={`Insert Plugins (${inserts.length})`}
            icon={<Layers className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />}
            defaultOpen={true}
          >
            {inserts.length === 0 ? (
              <div
                className="text-center py-4 text-xs"
                style={{ color: 'var(--studio-text-muted)' }}
              >
                No insert plugins
              </div>
            ) : (
              <div className="space-y-2">
                {inserts.map((insert, index) => (
                  <motion.div
                    key={insert.id}
                    className="flex items-center justify-between p-2 rounded"
                    style={{
                      background: insert.bypass ? 'transparent' : `${getPluginTypeColor(insert.type)}15`,
                      border: `1px solid ${getPluginTypeColor(insert.type)}40`,
                    }}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-1 h-8 rounded"
                        style={{ background: getPluginTypeColor(insert.type) }}
                      />
                      <div>
                        <span
                          className="text-xs font-medium"
                          style={{
                            color: insert.bypass ? 'var(--studio-text-muted)' : 'var(--studio-text)',
                            textDecoration: insert.bypass ? 'line-through' : 'none',
                          }}
                        >
                          {insert.name}
                        </span>
                        <span
                          className="block text-[9px] uppercase"
                          style={{ color: 'var(--studio-text-muted)' }}
                        >
                          {insert.type}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5">
                        <Label
                          htmlFor={`bypass-${insert.id}`}
                          className="text-[9px]"
                          style={{ color: 'var(--studio-text-muted)' }}
                        >
                          Bypass
                        </Label>
                        <Switch
                          id={`bypass-${insert.id}`}
                          checked={insert.bypass}
                          onCheckedChange={() => onInsertBypassToggle(insert.id)}
                          className="scale-75"
                        />
                      </div>
                      {onInsertRemove && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:bg-red-500/20"
                          onClick={() => onInsertRemove(insert.id)}
                        >
                          <Trash2 className="h-3 w-3 text-red-400" />
                        </Button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title={`Sends (${sends.length})`}
            icon={<ArrowUpFromLine className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />}
            defaultOpen={sends.length > 0}
          >
            {sends.length === 0 ? (
              <div
                className="text-center py-4 text-xs"
                style={{ color: 'var(--studio-text-muted)' }}
              >
                No sends configured
              </div>
            ) : (
              <div className="space-y-3">
                {sends.map((send) => (
                  <div
                    key={send.busId}
                    className="flex items-center gap-3 p-2 rounded"
                    style={{
                      background: 'var(--studio-bg-medium)',
                      border: '1px solid var(--studio-border)',
                    }}
                  >
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium" style={{ color: 'var(--studio-text)' }}>
                          {send.busName}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[9px] px-1.5 py-0.5 rounded"
                            style={{
                              background: send.preFader ? '#3b82f620' : '#6b728020',
                              color: send.preFader ? '#3b82f6' : 'var(--studio-text-muted)',
                            }}
                          >
                            {send.preFader ? 'PRE' : 'POST'}
                          </span>
                          {onSendMuteToggle && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => onSendMuteToggle(send.busId)}
                              style={{
                                background: send.mute ? '#ef444420' : 'transparent',
                              }}
                            >
                              <VolumeX
                                className="h-3 w-3"
                                style={{ color: send.mute ? '#ef4444' : 'var(--studio-text-muted)' }}
                              />
                            </Button>
                          )}
                        </div>
                      </div>
                      <Knob
                        value={send.level}
                        onChange={(value) => onSendLevelChange(send.busId, value)}
                        size={36}
                        min={0}
                        max={1}
                        defaultValue={0}
                        color="#9b59b6"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title="I/O Routing"
            icon={<Settings2 className="h-3.5 w-3.5" style={{ color: 'var(--studio-text-muted)' }} />}
            defaultOpen={false}
          >
            <div className="space-y-3">
              <div>
                <Label className="text-[10px] mb-1.5 block" style={{ color: 'var(--studio-text-muted)' }}>
                  Input
                </Label>
                <Select value={io.input} onValueChange={(value) => onIOChange?.('input', value)}>
                  <SelectTrigger
                    className="h-8 text-xs"
                    style={{
                      background: 'var(--studio-bg-medium)',
                      borderColor: 'var(--studio-border)',
                      color: 'var(--studio-text)',
                    }}
                  >
                    <ArrowDownToLine className="h-3 w-3 mr-2" style={{ color: trackColor }} />
                    <SelectValue placeholder="Select input" />
                  </SelectTrigger>
                  <SelectContent>
                    {io.inputOptions.map((option) => (
                      <SelectItem key={option} value={option} className="text-xs">
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-[10px] mb-1.5 block" style={{ color: 'var(--studio-text-muted)' }}>
                  Output
                </Label>
                <Select value={io.output} onValueChange={(value) => onIOChange?.('output', value)}>
                  <SelectTrigger
                    className="h-8 text-xs"
                    style={{
                      background: 'var(--studio-bg-medium)',
                      borderColor: 'var(--studio-border)',
                      color: 'var(--studio-text)',
                    }}
                  >
                    <ArrowUpFromLine className="h-3 w-3 mr-2" style={{ color: trackColor }} />
                    <SelectValue placeholder="Select output" />
                  </SelectTrigger>
                  <SelectContent>
                    {io.outputOptions.map((option) => (
                      <SelectItem key={option} value={option} className="text-xs">
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CollapsibleSection>

          <div
            className="p-3 flex justify-between"
            style={{ background: 'var(--studio-bg-medium)' }}
          >
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs hover:bg-red-500/20"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5 text-red-400" />
              <span style={{ color: '#ef4444' }}>Delete Track</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={onClose}
              style={{
                borderColor: 'var(--studio-border)',
                color: 'var(--studio-text)',
              }}
            >
              Close
            </Button>
          </div>
        </ScrollArea>
      </motion.div>
    </AnimatePresence>
  );
}

export type { InsertPlugin, SendLevel, IOAssignment, ChannelOverviewProps };
