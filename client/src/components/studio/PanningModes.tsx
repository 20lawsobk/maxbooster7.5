import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Knob } from './Knob';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

export type PanningMode = 'balance' | 'dualPan' | 'binaural' | 'midSide' | 'width';

export interface PanningState {
  mode: PanningMode;
  balance: number;
  leftPan: number;
  rightPan: number;
  azimuth: number;
  elevation: number;
  distance: number;
  midSideBalance: number;
  width: number;
}

export interface PanningModesProps {
  value: PanningState;
  onChange: (state: PanningState) => void;
  audioContext?: AudioContext;
  sourceNode?: AudioNode;
  destinationNode?: AudioNode;
  color?: string;
  compact?: boolean;
  showVisualizer?: boolean;
}

const defaultPanningState: PanningState = {
  mode: 'balance',
  balance: 0,
  leftPan: -1,
  rightPan: 1,
  azimuth: 0,
  elevation: 0,
  distance: 1,
  midSideBalance: 0,
  width: 1,
};

interface PanningNodesRef {
  stereoPanner: StereoPannerNode | null;
  leftGain: GainNode | null;
  rightGain: GainNode | null;
  pannerNode: PannerNode | null;
  midGain: GainNode | null;
  sideGain: GainNode | null;
  splitter: ChannelSplitterNode | null;
  merger: ChannelMergerNode | null;
  widthLeftGain: GainNode | null;
  widthRightGain: GainNode | null;
  widthCrossLeftGain: GainNode | null;
  widthCrossRightGain: GainNode | null;
}

export function PanningModes({
  value = defaultPanningState,
  onChange,
  audioContext,
  sourceNode,
  destinationNode,
  color = '#00ccff',
  compact = false,
  showVisualizer = true,
}: PanningModesProps) {
  const nodesRef = useRef<PanningNodesRef>({
    stereoPanner: null,
    leftGain: null,
    rightGain: null,
    pannerNode: null,
    midGain: null,
    sideGain: null,
    splitter: null,
    merger: null,
    widthLeftGain: null,
    widthRightGain: null,
    widthCrossLeftGain: null,
    widthCrossRightGain: null,
  });

  const updateValue = useCallback(
    (updates: Partial<PanningState>) => {
      onChange({ ...value, ...updates });
    },
    [value, onChange]
  );

  useEffect(() => {
    if (!audioContext || !sourceNode || !destinationNode) return;

    const nodes = nodesRef.current;

    try {
      sourceNode.disconnect();
    } catch {
    }

    Object.values(nodes).forEach((node) => {
      if (node) {
        try {
          node.disconnect();
        } catch {
        }
      }
    });

    switch (value.mode) {
      case 'balance': {
        nodes.stereoPanner = audioContext.createStereoPanner();
        nodes.stereoPanner.pan.setValueAtTime(value.balance, audioContext.currentTime);
        sourceNode.connect(nodes.stereoPanner);
        nodes.stereoPanner.connect(destinationNode);
        break;
      }

      case 'dualPan': {
        nodes.splitter = audioContext.createChannelSplitter(2);
        nodes.merger = audioContext.createChannelMerger(2);
        nodes.leftGain = audioContext.createGain();
        nodes.rightGain = audioContext.createGain();

        const leftPanValue = (value.leftPan + 1) / 2;
        const rightPanValue = (value.rightPan + 1) / 2;

        nodes.leftGain.gain.setValueAtTime(
          Math.cos((leftPanValue * Math.PI) / 2),
          audioContext.currentTime
        );
        nodes.rightGain.gain.setValueAtTime(
          Math.sin((rightPanValue * Math.PI) / 2),
          audioContext.currentTime
        );

        sourceNode.connect(nodes.splitter);
        nodes.splitter.connect(nodes.leftGain, 0);
        nodes.splitter.connect(nodes.rightGain, 1);
        nodes.leftGain.connect(nodes.merger, 0, 0);
        nodes.rightGain.connect(nodes.merger, 0, 1);
        nodes.merger.connect(destinationNode);
        break;
      }

      case 'binaural': {
        nodes.pannerNode = audioContext.createPanner();
        nodes.pannerNode.panningModel = 'HRTF';
        nodes.pannerNode.distanceModel = 'inverse';
        nodes.pannerNode.refDistance = 1;
        nodes.pannerNode.maxDistance = 10000;
        nodes.pannerNode.rolloffFactor = 1;
        nodes.pannerNode.coneInnerAngle = 360;
        nodes.pannerNode.coneOuterAngle = 360;

        const azimuthRad = (value.azimuth * Math.PI) / 180;
        const elevationRad = (value.elevation * Math.PI) / 180;
        const x = value.distance * Math.sin(azimuthRad) * Math.cos(elevationRad);
        const y = value.distance * Math.sin(elevationRad);
        const z = -value.distance * Math.cos(azimuthRad) * Math.cos(elevationRad);

        nodes.pannerNode.positionX.setValueAtTime(x, audioContext.currentTime);
        nodes.pannerNode.positionY.setValueAtTime(y, audioContext.currentTime);
        nodes.pannerNode.positionZ.setValueAtTime(z, audioContext.currentTime);

        sourceNode.connect(nodes.pannerNode);
        nodes.pannerNode.connect(destinationNode);
        break;
      }

      case 'midSide': {
        nodes.splitter = audioContext.createChannelSplitter(2);
        nodes.merger = audioContext.createChannelMerger(2);
        nodes.midGain = audioContext.createGain();
        nodes.sideGain = audioContext.createGain();

        const midLevel = 1 - Math.max(0, value.midSideBalance);
        const sideLevel = 1 + Math.min(0, value.midSideBalance);

        nodes.midGain.gain.setValueAtTime(midLevel, audioContext.currentTime);
        nodes.sideGain.gain.setValueAtTime(sideLevel, audioContext.currentTime);

        const midEncoder = audioContext.createGain();
        const sideEncoder = audioContext.createGain();
        midEncoder.gain.value = 0.5;
        sideEncoder.gain.value = 0.5;

        sourceNode.connect(nodes.splitter);

        const leftToMid = audioContext.createGain();
        const rightToMid = audioContext.createGain();
        leftToMid.gain.value = 1;
        rightToMid.gain.value = 1;

        const leftToSide = audioContext.createGain();
        const rightToSide = audioContext.createGain();
        leftToSide.gain.value = 1;
        rightToSide.gain.value = -1;

        nodes.splitter.connect(leftToMid, 0);
        nodes.splitter.connect(rightToMid, 1);
        nodes.splitter.connect(leftToSide, 0);
        nodes.splitter.connect(rightToSide, 1);

        leftToMid.connect(midEncoder);
        rightToMid.connect(midEncoder);
        leftToSide.connect(sideEncoder);
        rightToSide.connect(sideEncoder);

        midEncoder.connect(nodes.midGain);
        sideEncoder.connect(nodes.sideGain);

        const midToLeft = audioContext.createGain();
        const midToRight = audioContext.createGain();
        const sideToLeft = audioContext.createGain();
        const sideToRight = audioContext.createGain();

        midToLeft.gain.value = 1;
        midToRight.gain.value = 1;
        sideToLeft.gain.value = 1;
        sideToRight.gain.value = -1;

        nodes.midGain.connect(midToLeft);
        nodes.midGain.connect(midToRight);
        nodes.sideGain.connect(sideToLeft);
        nodes.sideGain.connect(sideToRight);

        midToLeft.connect(nodes.merger, 0, 0);
        sideToLeft.connect(nodes.merger, 0, 0);
        midToRight.connect(nodes.merger, 0, 1);
        sideToRight.connect(nodes.merger, 0, 1);

        nodes.merger.connect(destinationNode);
        break;
      }

      case 'width': {
        nodes.splitter = audioContext.createChannelSplitter(2);
        nodes.merger = audioContext.createChannelMerger(2);

        nodes.widthLeftGain = audioContext.createGain();
        nodes.widthRightGain = audioContext.createGain();
        nodes.widthCrossLeftGain = audioContext.createGain();
        nodes.widthCrossRightGain = audioContext.createGain();

        const width = value.width;
        const coefficient = width <= 1 ? width : 1;
        const crossCoefficient = width <= 1 ? 1 - width : 0;

        nodes.widthLeftGain.gain.setValueAtTime(coefficient, audioContext.currentTime);
        nodes.widthRightGain.gain.setValueAtTime(coefficient, audioContext.currentTime);
        nodes.widthCrossLeftGain.gain.setValueAtTime(crossCoefficient, audioContext.currentTime);
        nodes.widthCrossRightGain.gain.setValueAtTime(crossCoefficient, audioContext.currentTime);

        sourceNode.connect(nodes.splitter);

        nodes.splitter.connect(nodes.widthLeftGain, 0);
        nodes.splitter.connect(nodes.widthRightGain, 1);
        nodes.splitter.connect(nodes.widthCrossLeftGain, 1);
        nodes.splitter.connect(nodes.widthCrossRightGain, 0);

        nodes.widthLeftGain.connect(nodes.merger, 0, 0);
        nodes.widthCrossLeftGain.connect(nodes.merger, 0, 0);
        nodes.widthRightGain.connect(nodes.merger, 0, 1);
        nodes.widthCrossRightGain.connect(nodes.merger, 0, 1);

        nodes.merger.connect(destinationNode);
        break;
      }
    }

    return () => {
      Object.values(nodesRef.current).forEach((node) => {
        if (node) {
          try {
            node.disconnect();
          } catch {
          }
        }
      });
    };
  }, [audioContext, sourceNode, destinationNode, value]);

  const visualizerContent = useMemo(() => {
    if (!showVisualizer) return null;

    const size = compact ? 60 : 80;
    const center = size / 2;
    const radius = (size / 2) - 8;

    switch (value.mode) {
      case 'balance': {
        const x = center + value.balance * radius;
        return (
          <svg width={size} height={size} className="mx-auto">
            <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
            <line x1={center} y1={center - radius} x2={center} y2={center + radius} stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
            <text x={8} y={center + 4} fontSize="8" fill="rgba(255,255,255,0.5)">L</text>
            <text x={size - 12} y={center + 4} fontSize="8" fill="rgba(255,255,255,0.5)">R</text>
            <motion.circle
              cx={x}
              cy={center}
              r={6}
              fill={color}
              animate={{ cx: x }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              style={{ filter: `drop-shadow(0 0 4px ${color})` }}
            />
          </svg>
        );
      }

      case 'dualPan': {
        const leftX = center + value.leftPan * (radius * 0.8);
        const rightX = center + value.rightPan * (radius * 0.8);
        return (
          <svg width={size} height={size} className="mx-auto">
            <rect x={center - radius} y={center - 15} width={radius * 2} height={12} rx="2" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" />
            <rect x={center - radius} y={center + 3} width={radius * 2} height={12} rx="2" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)" />
            <text x={8} y={center - 6} fontSize="7" fill="rgba(255,255,255,0.4)">L</text>
            <text x={8} y={center + 12} fontSize="7" fill="rgba(255,255,255,0.4)">R</text>
            <motion.circle
              cx={leftX}
              cy={center - 9}
              r={4}
              fill="#3498db"
              animate={{ cx: leftX }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            />
            <motion.circle
              cx={rightX}
              cy={center + 9}
              r={4}
              fill="#e74c3c"
              animate={{ cx: rightX }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            />
          </svg>
        );
      }

      case 'binaural': {
        const azimuthRad = (value.azimuth * Math.PI) / 180;
        const x = center + Math.sin(azimuthRad) * radius * 0.8;
        const y = center - Math.cos(azimuthRad) * radius * 0.8;
        const elevationScale = 1 - (value.elevation / 90) * 0.5;
        return (
          <svg width={size} height={size} className="mx-auto">
            <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
            <circle cx={center} cy={center} r={radius * 0.6} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <circle cx={center} cy={center} r={radius * 0.3} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <line x1={center} y1={center - radius} x2={center} y2={center + radius} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
            <line x1={center - radius} y1={center} x2={center + radius} y2={center} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
            <text x={center - 3} y={8} fontSize="6" fill="rgba(255,255,255,0.4)">F</text>
            <text x={center - 3} y={size - 3} fontSize="6" fill="rgba(255,255,255,0.4)">B</text>
            <circle cx={center} cy={center} r={4} fill="rgba(255,255,255,0.3)" />
            <motion.circle
              cx={x}
              cy={y}
              r={6 * elevationScale}
              fill={color}
              animate={{ cx: x, cy: y, r: 6 * elevationScale }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              style={{ filter: `drop-shadow(0 0 4px ${color})` }}
            />
          </svg>
        );
      }

      case 'midSide': {
        const midWidth = Math.max(0, 1 - value.midSideBalance) * radius * 0.8;
        const sideWidth = Math.max(0, 1 + value.midSideBalance) * radius * 0.8;
        return (
          <svg width={size} height={size} className="mx-auto">
            <motion.rect
              x={center - midWidth}
              y={center - 12}
              width={midWidth * 2}
              height={10}
              rx="2"
              fill="#2ecc71"
              animate={{ x: center - midWidth, width: midWidth * 2 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              opacity={0.7}
            />
            <motion.rect
              x={center - sideWidth}
              y={center + 2}
              width={sideWidth * 2}
              height={10}
              rx="2"
              fill="#9b59b6"
              animate={{ x: center - sideWidth, width: sideWidth * 2 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              opacity={0.7}
            />
            <text x={center - 6} y={center - 4} fontSize="7" fill="rgba(255,255,255,0.6)">M</text>
            <text x={center - 4} y={center + 10} fontSize="7" fill="rgba(255,255,255,0.6)">S</text>
          </svg>
        );
      }

      case 'width': {
        const widthScale = value.width;
        const leftX = center - radius * 0.8 * widthScale;
        const rightX = center + radius * 0.8 * widthScale;
        return (
          <svg width={size} height={size} className="mx-auto">
            <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
            <motion.line
              x1={leftX}
              y1={center}
              x2={rightX}
              y2={center}
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
              animate={{ x1: leftX, x2: rightX }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              style={{ filter: `drop-shadow(0 0 3px ${color})` }}
            />
            <motion.circle
              cx={leftX}
              cy={center}
              r={4}
              fill={color}
              animate={{ cx: leftX }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            />
            <motion.circle
              cx={rightX}
              cy={center}
              r={4}
              fill={color}
              animate={{ cx: rightX }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            />
            <text x={center - 12} y={size - 6} fontSize="8" fill="rgba(255,255,255,0.5)">
              {(value.width * 100).toFixed(0)}%
            </text>
          </svg>
        );
      }
    }
  }, [value, color, compact, showVisualizer]);

  const controlsContent = useMemo(() => {
    switch (value.mode) {
      case 'balance':
        return (
          <div className="flex flex-col items-center gap-2">
            <Knob
              value={value.balance}
              onChange={(v) => updateValue({ balance: v })}
              min={-1}
              max={1}
              defaultValue={0}
              bipolar={true}
              label="BALANCE"
              size={compact ? 40 : 48}
              color={color}
            />
          </div>
        );

      case 'dualPan':
        return (
          <div className="flex gap-4 justify-center">
            <div className="flex flex-col items-center">
              <Knob
                value={value.leftPan}
                onChange={(v) => updateValue({ leftPan: v })}
                min={-1}
                max={1}
                defaultValue={-1}
                bipolar={true}
                label="LEFT"
                size={compact ? 36 : 42}
                color="#3498db"
              />
            </div>
            <div className="flex flex-col items-center">
              <Knob
                value={value.rightPan}
                onChange={(v) => updateValue({ rightPan: v })}
                min={-1}
                max={1}
                defaultValue={1}
                bipolar={true}
                label="RIGHT"
                size={compact ? 36 : 42}
                color="#e74c3c"
              />
            </div>
          </div>
        );

      case 'binaural':
        return (
          <div className="space-y-3">
            <div className="flex gap-3 justify-center">
              <Knob
                value={value.azimuth}
                onChange={(v) => updateValue({ azimuth: v })}
                min={-180}
                max={180}
                defaultValue={0}
                bipolar={false}
                label="AZIMUTH"
                size={compact ? 36 : 42}
                color={color}
                displayValue={`${value.azimuth.toFixed(0)}°`}
              />
              <Knob
                value={value.elevation}
                onChange={(v) => updateValue({ elevation: v })}
                min={-90}
                max={90}
                defaultValue={0}
                bipolar={false}
                label="ELEV"
                size={compact ? 36 : 42}
                color={color}
                displayValue={`${value.elevation.toFixed(0)}°`}
              />
            </div>
            <div className="px-2">
              <Label className="text-[9px]" style={{ color: 'var(--studio-text-muted)' }}>
                Distance: {value.distance.toFixed(1)}m
              </Label>
              <Slider
                value={[value.distance]}
                onValueChange={([v]) => updateValue({ distance: v })}
                min={0.1}
                max={10}
                step={0.1}
                className="mt-1"
              />
            </div>
          </div>
        );

      case 'midSide':
        return (
          <div className="flex flex-col items-center gap-2">
            <Knob
              value={value.midSideBalance}
              onChange={(v) => updateValue({ midSideBalance: v })}
              min={-1}
              max={1}
              defaultValue={0}
              bipolar={true}
              label="M/S"
              size={compact ? 40 : 48}
              color={color}
            />
            <div className="flex justify-between w-full px-2 text-[8px]" style={{ color: 'var(--studio-text-muted)' }}>
              <span>MID</span>
              <span>SIDE</span>
            </div>
          </div>
        );

      case 'width':
        return (
          <div className="flex flex-col items-center gap-2">
            <Knob
              value={value.width}
              onChange={(v) => updateValue({ width: v })}
              min={0}
              max={2}
              defaultValue={1}
              bipolar={false}
              label="WIDTH"
              size={compact ? 40 : 48}
              color={color}
              displayValue={`${(value.width * 100).toFixed(0)}%`}
            />
            <div className="flex justify-between w-full px-2 text-[8px]" style={{ color: 'var(--studio-text-muted)' }}>
              <span>MONO</span>
              <span>WIDE</span>
            </div>
          </div>
        );
    }
  }, [value, updateValue, color, compact]);

  return (
    <div
      className="flex flex-col gap-3 p-3 rounded-lg"
      style={{
        background: 'var(--studio-bg-medium)',
        border: '1px solid var(--studio-border)',
      }}
    >
      <div className="flex items-center justify-between">
        <Label className="text-[10px] font-semibold" style={{ color: 'var(--studio-text)' }}>
          PANNING
        </Label>
        <Select
          value={value.mode}
          onValueChange={(mode: PanningMode) => updateValue({ mode })}
        >
          <SelectTrigger 
            className="h-6 w-24 text-[10px]"
            style={{
              background: 'var(--studio-bg-deep)',
              borderColor: 'var(--studio-border)',
              color: 'var(--studio-text)',
            }}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="balance">Balance</SelectItem>
            <SelectItem value="dualPan">Dual Pan</SelectItem>
            <SelectItem value="binaural">Binaural 3D</SelectItem>
            <SelectItem value="midSide">Mid/Side</SelectItem>
            <SelectItem value="width">Width</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {showVisualizer && (
        <div className="flex justify-center py-1">
          {visualizerContent}
        </div>
      )}

      <div className="min-h-[60px] flex items-center justify-center">
        {controlsContent}
      </div>
    </div>
  );
}

export function createPanningNodes(
  audioContext: AudioContext,
  mode: PanningMode,
  state: PanningState
): { input: AudioNode; output: AudioNode; update: (state: PanningState) => void } {
  switch (mode) {
    case 'balance': {
      const panner = audioContext.createStereoPanner();
      panner.pan.value = state.balance;
      return {
        input: panner,
        output: panner,
        update: (s) => {
          panner.pan.setValueAtTime(s.balance, audioContext.currentTime);
        },
      };
    }

    case 'dualPan': {
      const splitter = audioContext.createChannelSplitter(2);
      const merger = audioContext.createChannelMerger(2);
      const leftGain = audioContext.createGain();
      const rightGain = audioContext.createGain();

      splitter.connect(leftGain, 0);
      splitter.connect(rightGain, 1);
      leftGain.connect(merger, 0, 0);
      rightGain.connect(merger, 0, 1);

      const updateGains = (s: PanningState) => {
        const leftPanValue = (s.leftPan + 1) / 2;
        const rightPanValue = (s.rightPan + 1) / 2;
        leftGain.gain.setValueAtTime(Math.cos((leftPanValue * Math.PI) / 2), audioContext.currentTime);
        rightGain.gain.setValueAtTime(Math.sin((rightPanValue * Math.PI) / 2), audioContext.currentTime);
      };

      updateGains(state);

      return {
        input: splitter,
        output: merger,
        update: updateGains,
      };
    }

    case 'binaural': {
      const panner = audioContext.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 10000;
      panner.rolloffFactor = 1;

      const updatePosition = (s: PanningState) => {
        const azimuthRad = (s.azimuth * Math.PI) / 180;
        const elevationRad = (s.elevation * Math.PI) / 180;
        const x = s.distance * Math.sin(azimuthRad) * Math.cos(elevationRad);
        const y = s.distance * Math.sin(elevationRad);
        const z = -s.distance * Math.cos(azimuthRad) * Math.cos(elevationRad);
        panner.positionX.setValueAtTime(x, audioContext.currentTime);
        panner.positionY.setValueAtTime(y, audioContext.currentTime);
        panner.positionZ.setValueAtTime(z, audioContext.currentTime);
      };

      updatePosition(state);

      return {
        input: panner,
        output: panner,
        update: updatePosition,
      };
    }

    case 'midSide': {
      const splitter = audioContext.createChannelSplitter(2);
      const merger = audioContext.createChannelMerger(2);
      const midGain = audioContext.createGain();
      const sideGain = audioContext.createGain();

      const leftToMid = audioContext.createGain();
      const rightToMid = audioContext.createGain();
      const leftToSide = audioContext.createGain();
      const rightToSide = audioContext.createGain();

      leftToMid.gain.value = 0.5;
      rightToMid.gain.value = 0.5;
      leftToSide.gain.value = 0.5;
      rightToSide.gain.value = -0.5;

      splitter.connect(leftToMid, 0);
      splitter.connect(rightToMid, 1);
      splitter.connect(leftToSide, 0);
      splitter.connect(rightToSide, 1);

      leftToMid.connect(midGain);
      rightToMid.connect(midGain);
      leftToSide.connect(sideGain);
      rightToSide.connect(sideGain);

      const midToLeft = audioContext.createGain();
      const midToRight = audioContext.createGain();
      const sideToLeft = audioContext.createGain();
      const sideToRight = audioContext.createGain();

      midToLeft.gain.value = 1;
      midToRight.gain.value = 1;
      sideToLeft.gain.value = 1;
      sideToRight.gain.value = -1;

      midGain.connect(midToLeft);
      midGain.connect(midToRight);
      sideGain.connect(sideToLeft);
      sideGain.connect(sideToRight);

      midToLeft.connect(merger, 0, 0);
      sideToLeft.connect(merger, 0, 0);
      midToRight.connect(merger, 0, 1);
      sideToRight.connect(merger, 0, 1);

      const updateBalance = (s: PanningState) => {
        const midLevel = 1 - Math.max(0, s.midSideBalance);
        const sideLevel = 1 + Math.min(0, s.midSideBalance);
        midGain.gain.setValueAtTime(midLevel, audioContext.currentTime);
        sideGain.gain.setValueAtTime(sideLevel, audioContext.currentTime);
      };

      updateBalance(state);

      return {
        input: splitter,
        output: merger,
        update: updateBalance,
      };
    }

    case 'width': {
      const splitter = audioContext.createChannelSplitter(2);
      const merger = audioContext.createChannelMerger(2);
      const leftGain = audioContext.createGain();
      const rightGain = audioContext.createGain();
      const crossLeftGain = audioContext.createGain();
      const crossRightGain = audioContext.createGain();

      splitter.connect(leftGain, 0);
      splitter.connect(rightGain, 1);
      splitter.connect(crossLeftGain, 1);
      splitter.connect(crossRightGain, 0);

      leftGain.connect(merger, 0, 0);
      crossLeftGain.connect(merger, 0, 0);
      rightGain.connect(merger, 0, 1);
      crossRightGain.connect(merger, 0, 1);

      const updateWidth = (s: PanningState) => {
        const width = s.width;
        const coefficient = width <= 1 ? width : 1;
        const crossCoefficient = width <= 1 ? 1 - width : 0;

        if (width > 1) {
          const extraWidth = (width - 1) * 0.5;
          leftGain.gain.setValueAtTime(1 + extraWidth, audioContext.currentTime);
          rightGain.gain.setValueAtTime(1 + extraWidth, audioContext.currentTime);
          crossLeftGain.gain.setValueAtTime(-extraWidth, audioContext.currentTime);
          crossRightGain.gain.setValueAtTime(-extraWidth, audioContext.currentTime);
        } else {
          leftGain.gain.setValueAtTime(coefficient, audioContext.currentTime);
          rightGain.gain.setValueAtTime(coefficient, audioContext.currentTime);
          crossLeftGain.gain.setValueAtTime(crossCoefficient, audioContext.currentTime);
          crossRightGain.gain.setValueAtTime(crossCoefficient, audioContext.currentTime);
        }
      };

      updateWidth(state);

      return {
        input: splitter,
        output: merger,
        update: updateWidth,
      };
    }
  }
}

export const defaultPanningValue = defaultPanningState;
