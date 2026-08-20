import type { PluginDefinition } from '../server/services/pluginHostService';

import MbReverbHallPlugin from './mb-reverb-hall';
import MbReverbRoomPlugin from './mb-reverb-room';
import MbReverbPlatePlugin from './mb-reverb-plate';
import MbReverbSpringPlugin from './mb-reverb-spring';
import MbReverbChamberPlugin from './mb-reverb-chamber';
import MbReverbShimmerPlugin from './mb-reverb-shimmer';
import MbReverbCathedralPlugin from './mb-reverb-cathedral';
import MbReverbAmbientPlugin from './mb-reverb-ambient';
import MbReverbGatedPlugin from './mb-reverb-gated';
import MbReverbConvolutionPlugin from './mb-reverb-convolution';
import MbDelayStereoPlugin from './mb-delay-stereo';
import MbDelayPingpongPlugin from './mb-delay-pingpong';
import MbDelayTapePlugin from './mb-delay-tape';
import MbDelayAnalogPlugin from './mb-delay-analog';
import MbDelaySlapbackPlugin from './mb-delay-slapback';
import MbDelayMultiPlugin from './mb-delay-multi';
import MbDelayModPlugin from './mb-delay-mod';
import MbDelayReversePlugin from './mb-delay-reverse';
import MbDelayDubPlugin from './mb-delay-dub';
import MbDelayGrainPlugin from './mb-delay-grain';
import MbCompStudioPlugin from './mb-comp-studio';
import MbCompVcaPlugin from './mb-comp-vca';
import MbCompOptoPlugin from './mb-comp-opto';
import MbCompTubePlugin from './mb-comp-tube';
import MbCompBusPlugin from './mb-comp-bus';
import MbCompMultibandPlugin from './mb-comp-multiband';
import MbCompSidechainPlugin from './mb-comp-sidechain';
import MbCompMasteringPlugin from './mb-comp-mastering';
import MbCompParallelPlugin from './mb-comp-parallel';
import MbCompTransientPlugin from './mb-comp-transient';
import MbEqParametricPlugin from './mb-eq-parametric';
import MbEqGraphicPlugin from './mb-eq-graphic';
import MbEqVintagePlugin from './mb-eq-vintage';
import MbEqChannelPlugin from './mb-eq-channel';
import MbEqLinearPlugin from './mb-eq-linear';
import MbEqDynamicPlugin from './mb-eq-dynamic';
import MbEqSurgicalPlugin from './mb-eq-surgical';
import MbEqAirPlugin from './mb-eq-air';
import MbEqBassPlugin from './mb-eq-bass';
import MbEqPresencePlugin from './mb-eq-presence';
import MbDistTubePlugin from './mb-dist-tube';
import MbDistTapePlugin from './mb-dist-tape';
import MbDistTransistorPlugin from './mb-dist-transistor';
import MbDistFuzzPlugin from './mb-dist-fuzz';
import MbDistBitcrushPlugin from './mb-dist-bitcrush';
import MbDistOverdrivePlugin from './mb-dist-overdrive';
import MbDistAmpPlugin from './mb-dist-amp';
import MbDistWaveshapePlugin from './mb-dist-waveshape';
import MbDistSoftPlugin from './mb-dist-soft';
import MbDistHarmonicsPlugin from './mb-dist-harmonics';
import MbChorusClassicPlugin from './mb-chorus-classic';
import MbChorusVintagePlugin from './mb-chorus-vintage';
import MbChorusDimensionPlugin from './mb-chorus-dimension';
import MbFlangerJetPlugin from './mb-flanger-jet';
import MbFlangerTapePlugin from './mb-flanger-tape';
import MbPhaserClassicPlugin from './mb-phaser-classic';
import MbPhaserStereoPlugin from './mb-phaser-stereo';
import MbTremoloPlugin from './mb-tremolo';
import MbVibratoPlugin from './mb-vibrato';
import MbRotaryPlugin from './mb-rotary';
import MbLimiterMasterPlugin from './mb-limiter-master';
import MbLimiterBrickwallPlugin from './mb-limiter-brickwall';
import MbLimiterSoftPlugin from './mb-limiter-soft';
import MbGateNoisePlugin from './mb-gate-noise';
import MbGateExpanderPlugin from './mb-gate-expander';
import MbGateDrumPlugin from './mb-gate-drum';
import MbDeesserPlugin from './mb-deesser';
import MbMaximizerPlugin from './mb-maximizer';
import MbLevelerPlugin from './mb-leveler';
import MbLoudnessPlugin from './mb-loudness';
import MbVocalAutotunePlugin from './mb-vocal-autotune';
import MbVocalHarmonyPlugin from './mb-vocal-harmony';
import MbVocalDoublerPlugin from './mb-vocal-doubler';
import MbVocalFormantPlugin from './mb-vocal-formant';
import MbVocalCompPlugin from './mb-vocal-comp';
import MbVocalEqPlugin from './mb-vocal-eq';
import MbVocalDebreathPlugin from './mb-vocal-debreath';
import MbVocalExciterPlugin from './mb-vocal-exciter';
import MbVocalRiderPlugin from './mb-vocal-rider';
import MbVocalVocoderPlugin from './mb-vocal-vocoder';
import MbMicU87Plugin from './mb-mic-u87';
import MbMicC414Plugin from './mb-mic-c414';
import MbMicSm7bPlugin from './mb-mic-sm7b';
import MbMicRibbonPlugin from './mb-mic-ribbon';
import MbMicSm58Plugin from './mb-mic-sm58';
import MbMicPreampPlugin from './mb-mic-preamp';
import MbMicRoomPlugin from './mb-mic-room';
import MbMicIsolationPlugin from './mb-mic-isolation';
import MbMicPlosivePlugin from './mb-mic-plosive';
import MbMicChannelPlugin from './mb-mic-channel';
import MbPianoGrandPlugin from './mb-piano-grand';
import MbPianoUprightPlugin from './mb-piano-upright';
import MbPianoElectricPlugin from './mb-piano-electric';
import MbPianoWurlitzerPlugin from './mb-piano-wurlitzer';
import MbPianoClavinetPlugin from './mb-piano-clavinet';
import MbPianoHonkytonkPlugin from './mb-piano-honkytonk';
import MbPianoToyPlugin from './mb-piano-toy';
import MbPianoPreparedPlugin from './mb-piano-prepared';
import MbPianoFeltPlugin from './mb-piano-felt';
import MbPianoCrystalPlugin from './mb-piano-crystal';
import MbStringsEnsemblePlugin from './mb-strings-ensemble';
import MbStringsViolinPlugin from './mb-strings-violin';
import MbStringsViolaPlugin from './mb-strings-viola';
import MbStringsCelloPlugin from './mb-strings-cello';
import MbStringsBassPlugin from './mb-strings-bass';
import MbStringsPizzicatoPlugin from './mb-strings-pizzicato';
import MbStringsTremoloPlugin from './mb-strings-tremolo';
import MbStringsSpiccatoPlugin from './mb-strings-spiccato';
import MbStringsLegatoPlugin from './mb-strings-legato';
import MbStringsCinematicPlugin from './mb-strings-cinematic';
import MbDrumsAcousticPlugin from './mb-drums-acoustic';
import MbDrumsElectronicPlugin from './mb-drums-electronic';
import MbDrumsHiphopPlugin from './mb-drums-hiphop';
import MbDrumsRockPlugin from './mb-drums-rock';
import MbDrumsJazzPlugin from './mb-drums-jazz';
import MbDrumsTrapPlugin from './mb-drums-trap';
import MbDrumsEdmPlugin from './mb-drums-edm';
import MbDrumsLofiPlugin from './mb-drums-lofi';
import MbDrumsPercussionPlugin from './mb-drums-percussion';
import MbDrumsCinematicPlugin from './mb-drums-cinematic';
import MbBassSubPlugin from './mb-bass-sub';
import MbBassReesePlugin from './mb-bass-reese';
import MbBassWobblePlugin from './mb-bass-wobble';
import MbBass808Plugin from './mb-bass-808';
import MbBassAcidPlugin from './mb-bass-acid';
import MbBassFmPlugin from './mb-bass-fm';
import MbBassElectricPlugin from './mb-bass-electric';
import MbBassSlapPlugin from './mb-bass-slap';
import MbBassUprightPlugin from './mb-bass-upright';
import MbBassMoogPlugin from './mb-bass-moog';
import MbPadWarmPlugin from './mb-pad-warm';
import MbPadDigitalPlugin from './mb-pad-digital';
import MbPadStringsPlugin from './mb-pad-strings';
import MbPadAmbientPlugin from './mb-pad-ambient';
import MbPadChoirPlugin from './mb-pad-choir';
import MbPadGlassPlugin from './mb-pad-glass';
import MbPadDarkPlugin from './mb-pad-dark';
import MbPadEvolvingPlugin from './mb-pad-evolving';
import MbPadVintagePlugin from './mb-pad-vintage';
import MbPadCinematicPlugin from './mb-pad-cinematic';
import MbSynthAnalogPlugin from './mb-synth-analog';
import MbSynthSupersawPlugin from './mb-synth-supersaw';
import MbSynthPluckPlugin from './mb-synth-pluck';
import MbSynthArpPlugin from './mb-synth-arp';
import MbSynthMonoPlugin from './mb-synth-mono';
import MbSynthPolyPlugin from './mb-synth-poly';
import MbSynthRetroPlugin from './mb-synth-retro';
import MbSynthTrancePlugin from './mb-synth-trance';
import MbSynthDubstepPlugin from './mb-synth-dubstep';
import MbSynthChiptunePlugin from './mb-synth-chiptune';
import MbFmDxPlugin from './mb-fm-dx';
import MbFmEpianoPlugin from './mb-fm-epiano';
import MbFmBassPlugin from './mb-fm-bass';
import MbFmBellPlugin from './mb-fm-bell';
import MbFmBrassPlugin from './mb-fm-brass';
import MbFmOrganPlugin from './mb-fm-organ';
import MbFmStringsPlugin from './mb-fm-strings';
import MbFmPluckPlugin from './mb-fm-pluck';
import MbFmMalletPlugin from './mb-fm-mallet';
import MbFmLeadPlugin from './mb-fm-lead';
import MbWtSerumPlugin from './mb-wt-serum';
import MbWtMassivePlugin from './mb-wt-massive';
import MbWtEvolvingPlugin from './mb-wt-evolving';
import MbWtPluckPlugin from './mb-wt-pluck';
import MbWtDigitalPlugin from './mb-wt-digital';
import MbWtGrowlPlugin from './mb-wt-growl';
import MbWtVocalPlugin from './mb-wt-vocal';
import MbWtSupersawPlugin from './mb-wt-supersaw';
import MbWtCinematicPlugin from './mb-wt-cinematic';
import MbWtArpPlugin from './mb-wt-arp';
import MbSamplerPianoPlugin from './mb-sampler-piano';
import MbSamplerStringsPlugin from './mb-sampler-strings';
import MbSamplerDrumsPlugin from './mb-sampler-drums';
import MbSamplerChoirPlugin from './mb-sampler-choir';
import MbSamplerBrassPlugin from './mb-sampler-brass';
import MbSamplerWoodwindPlugin from './mb-sampler-woodwind';
import MbSamplerGuitarPlugin from './mb-sampler-guitar';
import MbSamplerWorldPlugin from './mb-sampler-world';
import MbSamplerSynthPlugin from './mb-sampler-synth';
import MbSamplerTexturePlugin from './mb-sampler-texture';
import MbAnalogPolysynthPlugin from './mb-analog-polysynth';
import MbSupersawLeadPlugin from './mb-supersaw-lead';
import MbAcidBassPlugin from './mb-acid-bass';
import MbFmElectricPianoPlugin from './mb-fm-electric-piano';
import MbGranularSynthPlugin from './mb-granular-synth';
import MbOrganPlugin from './mb-organ';
import MbMultibandCompressorPlugin from './mb-multiband-compressor';
import MbTapeSaturationPlugin from './mb-tape-saturation';
import MbStereoImagerPlugin from './mb-stereo-imager';
import MbTransientShaperPlugin from './mb-transient-shaper';
import MbHarmonicExciterPlugin from './mb-harmonic-exciter';
import MbVintageEqPlugin from './mb-vintage-eq';
import MbPitchShifterPlugin from './mb-pitch-shifter';
import MbVintageLimiterPlugin from './mb-vintage-limiter';
import MbSpringReverbPlugin from './mb-spring-reverb';
import MbShimmerReverbPlugin from './mb-shimmer-reverb';
import MbPingPongDelayPlugin from './mb-ping-pong-delay';
import MbAutoFilterPlugin from './mb-auto-filter';
import MbBitcrusherPlugin from './mb-bitcrusher';
import MbVinylSimulatorPlugin from './mb-vinyl-simulator';
import MbStereoWidenerPlugin from './mb-stereo-widener';
import MbMonoMakerPlugin from './mb-mono-maker';
import MbStereoImagerMsPlugin from './mb-stereo-imager-ms';
import MbHaasEffectPlugin from './mb-haas-effect';
import MbSpatialEnhancerPlugin from './mb-spatial-enhancer';
import Mb3dPannerPlugin from './mb-3d-panner';
import MbBinauralPlugin from './mb-binaural';
import MbSurroundEncoderPlugin from './mb-surround-encoder';
import MbCorrelationMeterPlugin from './mb-correlation-meter';
import MbMidSideProcPlugin from './mb-mid-side-proc';
import MbStereoCrossfeedPlugin from './mb-stereo-crossfeed';
import MbStereoBalancePlugin from './mb-stereo-balance';
import MbStereoRotationPlugin from './mb-stereo-rotation';
import MbStereoDopplerPlugin from './mb-stereo-doppler';
import MbLoudnessMaxPlugin from './mb-loudness-max';
import MbMasterStereoPlugin from './mb-master-stereo';
import MbMultibandStereoPlugin from './mb-multiband-stereo';
import MbDitherPlugin from './mb-dither';
import MbSrcPlugin from './mb-src';
import MbTruePeakLimiterPlugin from './mb-true-peak-limiter';
import MbBrickwallLimiterPlugin from './mb-brickwall-limiter';
import MbIspLimiterPlugin from './mb-isp-limiter';
import MbMeteringPlugin from './mb-metering';
import MbMasterChainPlugin from './mb-master-chain';
import MbMasterDeesserPlugin from './mb-master-deesser';
import MbMasterTiltPlugin from './mb-master-tilt';
import MbMasterKWeightPlugin from './mb-master-k-weight';
import MbMasterReferencePlugin from './mb-master-reference';
import MbFilterLpPlugin from './mb-filter-lp';
import MbFilterHpPlugin from './mb-filter-hp';
import MbFilterBpPlugin from './mb-filter-bp';
import MbFilterNotchPlugin from './mb-filter-notch';
import MbFilterCombPlugin from './mb-filter-comb';
import MbFilterAllpassPlugin from './mb-filter-allpass';
import MbFilterFormantPlugin from './mb-filter-formant';
import MbFilterWahPlugin from './mb-filter-wah';
import MbFilterAutowahPlugin from './mb-filter-autowah';
import MbFilterSweepPlugin from './mb-filter-sweep';
import MbFilterTalkboxPlugin from './mb-filter-talkbox';
import MbFilterLadderPlugin from './mb-filter-ladder';
import MbFilterStateVarPlugin from './mb-filter-state-var';
import MbUtilGainPlugin from './mb-util-gain';
import MbUtilPanPlugin from './mb-util-pan';
import MbUtilPhasePlugin from './mb-util-phase';
import MbUtilPolarityPlugin from './mb-util-polarity';
import MbUtilMonoPlugin from './mb-util-mono';
import MbUtilDcoffsetPlugin from './mb-util-dcoffset';
import MbUtilTesttonePlugin from './mb-util-testtone';
import MbUtilSpectrumPlugin from './mb-util-spectrum';
import MbUtilOscilloscopePlugin from './mb-util-oscilloscope';
import MbUtilTunerPlugin from './mb-util-tuner';
import MbUtilTrimPlugin from './mb-util-trim';
import MbUtilDelayCompPlugin from './mb-util-delay-comp';
import MbUtilAbSwitchPlugin from './mb-util-ab-switch';
import MbCreativeGrandelayPlugin from './mb-creative-grandelay';
import MbCreativePitchshiftPlugin from './mb-creative-pitchshift';
import MbCreativeFreqshiftPlugin from './mb-creative-freqshift';
import MbCreativeHarmonicsPlugin from './mb-creative-harmonics';
import MbCreativeSubenhancePlugin from './mb-creative-subenhance';
import MbCreativeBassenhancePlugin from './mb-creative-bassenhance';
import MbCreativeExciterPlugin from './mb-creative-exciter';
import MbCreativePsychoPlugin from './mb-creative-psycho';
import MbCreativeSaturationPlugin from './mb-creative-saturation';
import MbCreativeRingmodPlugin from './mb-creative-ringmod';
import MbCreativeVocoderPlugin from './mb-creative-vocoder';
import MbCreativeSpectralGatePlugin from './mb-creative-spectral-gate';
import MbCreativeSampleHoldPlugin from './mb-creative-sample-hold';
import MbTimeStretchPlugin from './mb-time-stretch';
import MbTimePitchtimePlugin from './mb-time-pitchtime';
import MbTimeVarispeedPlugin from './mb-time-varispeed';
import MbTimeReversePlugin from './mb-time-reverse';
import MbTimeFreezePlugin from './mb-time-freeze';
import MbTimeStutterPlugin from './mb-time-stutter';
import MbTimeBeatrepeatPlugin from './mb-time-beatrepeat';
import MbTimeSlicePlugin from './mb-time-slice';
import MbTimeRetriggerPlugin from './mb-time-retrigger';
import MbTimeGateseqPlugin from './mb-time-gateseq';
import MbTimeGrainDelayPlugin from './mb-time-grain-delay';
import MbTimeLooperPlugin from './mb-time-looper';
import MbTimeScatterPlugin from './mb-time-scatter';
import MbTimeTapeLoopPlugin from './mb-time-tape-loop';
import MbRestoreNrPlugin from './mb-restore-nr';
import MbRestoreDehumPlugin from './mb-restore-dehum';
import MbRestoreDeclickPlugin from './mb-restore-declick';
import MbRestoreDecracklePlugin from './mb-restore-decrackle';
import MbRestoreDeclipPlugin from './mb-restore-declip';
import MbRestoreSpectralPlugin from './mb-restore-spectral';
import MbRestoreDialoguePlugin from './mb-restore-dialogue';
import MbRestoreHissPlugin from './mb-restore-hiss';
import MbRestoreRumblePlugin from './mb-restore-rumble';
import MbRestoreDepopPlugin from './mb-restore-depop';
import MbRestoreWindPlugin from './mb-restore-wind';
import MbRestoreBroadbandPlugin from './mb-restore-broadband';
import MbRestoreMouthDeclickPlugin from './mb-restore-mouth-declick';
import MbRestorePhaseCorrectPlugin from './mb-restore-phase-correct';
import MbReverbPlugin from './mb-reverb';
import MbDelayPlugin from './mb-delay';
import MbChorusPlugin from './mb-chorus';
import MbCompressorPlugin from './mb-compressor';
import MbEqPlugin from './mb-eq';
import MbLimiterPlugin from './mb-limiter';
import MbGatePlugin from './mb-gate';
import MbDistortionPlugin from './mb-distortion';
import MbPhaserPlugin from './mb-phaser';
import MbFlangerPlugin from './mb-flanger';
import MbMixConsolePlugin from './mb-mix-console';
import MbMixSummingPlugin from './mb-mix-summing';
import MbMixTapeMachinePlugin from './mb-mix-tape-machine';
import MbMixVcaGroupPlugin from './mb-mix-vca-group';
import MbMixBusCompPlugin from './mb-mix-bus-comp';
import MbMixSendFxPlugin from './mb-mix-send-fx';
import MbMixTransformerPlugin from './mb-mix-transformer';
import MbMixMonitorPlugin from './mb-mix-monitor';
import MbMixParallelPlugin from './mb-mix-parallel';
import MbMixHeadphonePlugin from './mb-mix-headphone';
import MbBrassTrumpetPlugin from './mb-brass-trumpet';
import MbBrassTrombonePlugin from './mb-brass-trombone';
import MbBrassFrenchhornPlugin from './mb-brass-frenchhorn';
import MbBrassTubaPlugin from './mb-brass-tuba';
import MbBrassSaxAltoPlugin from './mb-brass-sax-alto';
import MbBrassSaxTenorPlugin from './mb-brass-sax-tenor';
import MbBrassSaxSopranoPlugin from './mb-brass-sax-soprano';
import MbBrassSaxBariPlugin from './mb-brass-sax-bari';
import MbBrassEnsemblePlugin from './mb-brass-ensemble';
import MbBrassFlugelhornPlugin from './mb-brass-flugelhorn';
import MbBrassCornetPlugin from './mb-brass-cornet';
import MbBrassEuphoniumPlugin from './mb-brass-euphonium';
import MbBrassMutedTrumpetPlugin from './mb-brass-muted-trumpet';
import MbWoodwindFlutePlugin from './mb-woodwind-flute';
import MbWoodwindClarinetPlugin from './mb-woodwind-clarinet';
import MbWoodwindOboePlugin from './mb-woodwind-oboe';
import MbWoodwindBassoonPlugin from './mb-woodwind-bassoon';
import MbWoodwindPiccoloPlugin from './mb-woodwind-piccolo';
import MbWoodwindRecorderPlugin from './mb-woodwind-recorder';
import MbWoodwindPanflutePlugin from './mb-woodwind-panflute';
import MbWoodwindShakuhachiPlugin from './mb-woodwind-shakuhachi';
import MbWoodwindEnglishHornPlugin from './mb-woodwind-english-horn';
import MbWoodwindHarmonicaPlugin from './mb-woodwind-harmonica';
import MbWoodwindBagpipePlugin from './mb-woodwind-bagpipe';
import MbWoodwindAccordionPlugin from './mb-woodwind-accordion';
import MbOrganPipePlugin from './mb-organ-pipe';
import MbOrganHammondPlugin from './mb-organ-hammond';
import MbOrganChurchPlugin from './mb-organ-church';
import MbOrganComboPlugin from './mb-organ-combo';
import MbOrganTransistorPlugin from './mb-organ-transistor';
import MbOrganReedPlugin from './mb-organ-reed';
import MbOrganGospelPlugin from './mb-organ-gospel';
import MbOrganFarfisaPlugin from './mb-organ-farfisa';
import MbGuitarAcousticPlugin from './mb-guitar-acoustic';
import MbGuitarElectricCleanPlugin from './mb-guitar-electric-clean';
import MbGuitarElectricDirtyPlugin from './mb-guitar-electric-dirty';
import MbGuitarNylonPlugin from './mb-guitar-nylon';
import MbGuitar12stringPlugin from './mb-guitar-12string';
import MbGuitarSlidePlugin from './mb-guitar-slide';
import MbGuitarSteelPlugin from './mb-guitar-steel';
import MbGuitarBassElectricPlugin from './mb-guitar-bass-electric';
import MbGuitarBanjoPlugin from './mb-guitar-banjo';
import MbGuitarUkulelePlugin from './mb-guitar-ukulele';
import MbGuitarMandolinPlugin from './mb-guitar-mandolin';
import MbGuitarResonatorPlugin from './mb-guitar-resonator';
import MbGuitarSitarElectricPlugin from './mb-guitar-sitar-electric';
import MbMalletVibraphonePlugin from './mb-mallet-vibraphone';
import MbMalletMarimbaPlugin from './mb-mallet-marimba';
import MbMalletXylophonePlugin from './mb-mallet-xylophone';
import MbMalletGlockenspielPlugin from './mb-mallet-glockenspiel';
import MbMalletCelestaPlugin from './mb-mallet-celesta';
import MbMalletMusicboxPlugin from './mb-mallet-musicbox';
import MbMalletKalimbaPlugin from './mb-mallet-kalimba';
import MbMalletHarpPlugin from './mb-mallet-harp';
import MbMalletSteelpanPlugin from './mb-mallet-steelpan';
import MbMalletDulcimerPlugin from './mb-mallet-dulcimer';
import MbMalletBalafonPlugin from './mb-mallet-balafon';
import MbMalletCrotalesPlugin from './mb-mallet-crotales';
import MbEthnicSitarPlugin from './mb-ethnic-sitar';
import MbEthnicKotoPlugin from './mb-ethnic-koto';
import MbEthnicErhuPlugin from './mb-ethnic-erhu';
import MbEthnicDudukPlugin from './mb-ethnic-duduk';
import MbEthnicOudPlugin from './mb-ethnic-oud';
import MbEthnicBalalaikaPlugin from './mb-ethnic-balalaika';
import MbEthnicDidgeridooPlugin from './mb-ethnic-didgeridoo';
import MbEthnicMbiraPlugin from './mb-ethnic-mbira';
import MbEthnicGamelanPlugin from './mb-ethnic-gamelan';
import MbEthnicTablaPlugin from './mb-ethnic-tabla';
import MbEthnicSantoorPlugin from './mb-ethnic-santoor';
import MbEthnicBouzoukiPlugin from './mb-ethnic-bouzouki';
import MbEthnicGuzhengPlugin from './mb-ethnic-guzheng';
import MbEthnicShamisenPlugin from './mb-ethnic-shamisen';
import MbEthnicCharangoPlugin from './mb-ethnic-charango';
import MbEthnicDiziPlugin from './mb-ethnic-dizi';
import MbEthnicDjembePlugin from './mb-ethnic-djembe';
import MbEthnicZurnaPlugin from './mb-ethnic-zurna';
import MbVocalChoirPlugin from './mb-vocal-choir';
import MbVocalVocoderSynthPlugin from './mb-vocal-vocoder-synth';
import MbVocalTalkboxPlugin from './mb-vocal-talkbox';
import MbVocalFormantSynthPlugin from './mb-vocal-formant-synth';
import MbVocalSopranoPlugin from './mb-vocal-soprano';
import MbVocalBassVoicePlugin from './mb-vocal-bass-voice';
import MbVocalWhisperPlugin from './mb-vocal-whisper';
import MbVocalRobotPlugin from './mb-vocal-robot';
import MbBellTubularPlugin from './mb-bell-tubular';
import MbBellChimesPlugin from './mb-bell-chimes';
import MbBellSteeldrumPlugin from './mb-bell-steeldrum';
import MbBellChurchbellPlugin from './mb-bell-churchbell';
import MbBellHandbellPlugin from './mb-bell-handbell';
import MbBellTibetanPlugin from './mb-bell-tibetan';
import MbBellCrystalBowlPlugin from './mb-bell-crystal-bowl';
import MbBellGongPlugin from './mb-bell-gong';
import MbPianoPlugin from './mb-piano';
import MbStringsPlugin from './mb-strings';
import MbDrumsPlugin from './mb-drums';
import MbBassPlugin from './mb-bass';
import MbPadPlugin from './mb-pad';
import MbAnalogSynthPlugin from './mb-analog-synth';
import MbFmSynthPlugin from './mb-fm-synth';
import MbWavetableSynthPlugin from './mb-wavetable-synth';
import MbSamplerPlugin from './mb-sampler';

export const ALL_PLUGINS: PluginDefinition[] = [
  MbReverbHallPlugin,
  MbReverbRoomPlugin,
  MbReverbPlatePlugin,
  MbReverbSpringPlugin,
  MbReverbChamberPlugin,
  MbReverbShimmerPlugin,
  MbReverbCathedralPlugin,
  MbReverbAmbientPlugin,
  MbReverbGatedPlugin,
  MbReverbConvolutionPlugin,
  MbDelayStereoPlugin,
  MbDelayPingpongPlugin,
  MbDelayTapePlugin,
  MbDelayAnalogPlugin,
  MbDelaySlapbackPlugin,
  MbDelayMultiPlugin,
  MbDelayModPlugin,
  MbDelayReversePlugin,
  MbDelayDubPlugin,
  MbDelayGrainPlugin,
  MbCompStudioPlugin,
  MbCompVcaPlugin,
  MbCompOptoPlugin,
  MbCompTubePlugin,
  MbCompBusPlugin,
  MbCompMultibandPlugin,
  MbCompSidechainPlugin,
  MbCompMasteringPlugin,
  MbCompParallelPlugin,
  MbCompTransientPlugin,
  MbEqParametricPlugin,
  MbEqGraphicPlugin,
  MbEqVintagePlugin,
  MbEqChannelPlugin,
  MbEqLinearPlugin,
  MbEqDynamicPlugin,
  MbEqSurgicalPlugin,
  MbEqAirPlugin,
  MbEqBassPlugin,
  MbEqPresencePlugin,
  MbDistTubePlugin,
  MbDistTapePlugin,
  MbDistTransistorPlugin,
  MbDistFuzzPlugin,
  MbDistBitcrushPlugin,
  MbDistOverdrivePlugin,
  MbDistAmpPlugin,
  MbDistWaveshapePlugin,
  MbDistSoftPlugin,
  MbDistHarmonicsPlugin,
  MbChorusClassicPlugin,
  MbChorusVintagePlugin,
  MbChorusDimensionPlugin,
  MbFlangerJetPlugin,
  MbFlangerTapePlugin,
  MbPhaserClassicPlugin,
  MbPhaserStereoPlugin,
  MbTremoloPlugin,
  MbVibratoPlugin,
  MbRotaryPlugin,
  MbLimiterMasterPlugin,
  MbLimiterBrickwallPlugin,
  MbLimiterSoftPlugin,
  MbGateNoisePlugin,
  MbGateExpanderPlugin,
  MbGateDrumPlugin,
  MbDeesserPlugin,
  MbMaximizerPlugin,
  MbLevelerPlugin,
  MbLoudnessPlugin,
  MbVocalAutotunePlugin,
  MbVocalHarmonyPlugin,
  MbVocalDoublerPlugin,
  MbVocalFormantPlugin,
  MbVocalCompPlugin,
  MbVocalEqPlugin,
  MbVocalDebreathPlugin,
  MbVocalExciterPlugin,
  MbVocalRiderPlugin,
  MbVocalVocoderPlugin,
  MbMicU87Plugin,
  MbMicC414Plugin,
  MbMicSm7bPlugin,
  MbMicRibbonPlugin,
  MbMicSm58Plugin,
  MbMicPreampPlugin,
  MbMicRoomPlugin,
  MbMicIsolationPlugin,
  MbMicPlosivePlugin,
  MbMicChannelPlugin,
  MbPianoGrandPlugin,
  MbPianoUprightPlugin,
  MbPianoElectricPlugin,
  MbPianoWurlitzerPlugin,
  MbPianoClavinetPlugin,
  MbPianoHonkytonkPlugin,
  MbPianoToyPlugin,
  MbPianoPreparedPlugin,
  MbPianoFeltPlugin,
  MbPianoCrystalPlugin,
  MbStringsEnsemblePlugin,
  MbStringsViolinPlugin,
  MbStringsViolaPlugin,
  MbStringsCelloPlugin,
  MbStringsBassPlugin,
  MbStringsPizzicatoPlugin,
  MbStringsTremoloPlugin,
  MbStringsSpiccatoPlugin,
  MbStringsLegatoPlugin,
  MbStringsCinematicPlugin,
  MbDrumsAcousticPlugin,
  MbDrumsElectronicPlugin,
  MbDrumsHiphopPlugin,
  MbDrumsRockPlugin,
  MbDrumsJazzPlugin,
  MbDrumsTrapPlugin,
  MbDrumsEdmPlugin,
  MbDrumsLofiPlugin,
  MbDrumsPercussionPlugin,
  MbDrumsCinematicPlugin,
  MbBassSubPlugin,
  MbBassReesePlugin,
  MbBassWobblePlugin,
  MbBass808Plugin,
  MbBassAcidPlugin,
  MbBassFmPlugin,
  MbBassElectricPlugin,
  MbBassSlapPlugin,
  MbBassUprightPlugin,
  MbBassMoogPlugin,
  MbPadWarmPlugin,
  MbPadDigitalPlugin,
  MbPadStringsPlugin,
  MbPadAmbientPlugin,
  MbPadChoirPlugin,
  MbPadGlassPlugin,
  MbPadDarkPlugin,
  MbPadEvolvingPlugin,
  MbPadVintagePlugin,
  MbPadCinematicPlugin,
  MbSynthAnalogPlugin,
  MbSynthSupersawPlugin,
  MbSynthPluckPlugin,
  MbSynthArpPlugin,
  MbSynthMonoPlugin,
  MbSynthPolyPlugin,
  MbSynthRetroPlugin,
  MbSynthTrancePlugin,
  MbSynthDubstepPlugin,
  MbSynthChiptunePlugin,
  MbFmDxPlugin,
  MbFmEpianoPlugin,
  MbFmBassPlugin,
  MbFmBellPlugin,
  MbFmBrassPlugin,
  MbFmOrganPlugin,
  MbFmStringsPlugin,
  MbFmPluckPlugin,
  MbFmMalletPlugin,
  MbFmLeadPlugin,
  MbWtSerumPlugin,
  MbWtMassivePlugin,
  MbWtEvolvingPlugin,
  MbWtPluckPlugin,
  MbWtDigitalPlugin,
  MbWtGrowlPlugin,
  MbWtVocalPlugin,
  MbWtSupersawPlugin,
  MbWtCinematicPlugin,
  MbWtArpPlugin,
  MbSamplerPianoPlugin,
  MbSamplerStringsPlugin,
  MbSamplerDrumsPlugin,
  MbSamplerChoirPlugin,
  MbSamplerBrassPlugin,
  MbSamplerWoodwindPlugin,
  MbSamplerGuitarPlugin,
  MbSamplerWorldPlugin,
  MbSamplerSynthPlugin,
  MbSamplerTexturePlugin,
  MbAnalogPolysynthPlugin,
  MbSupersawLeadPlugin,
  MbAcidBassPlugin,
  MbFmElectricPianoPlugin,
  MbGranularSynthPlugin,
  MbOrganPlugin,
  MbMultibandCompressorPlugin,
  MbTapeSaturationPlugin,
  MbStereoImagerPlugin,
  MbTransientShaperPlugin,
  MbHarmonicExciterPlugin,
  MbVintageEqPlugin,
  MbPitchShifterPlugin,
  MbVintageLimiterPlugin,
  MbSpringReverbPlugin,
  MbShimmerReverbPlugin,
  MbPingPongDelayPlugin,
  MbAutoFilterPlugin,
  MbBitcrusherPlugin,
  MbVinylSimulatorPlugin,
  MbStereoWidenerPlugin,
  MbMonoMakerPlugin,
  MbStereoImagerMsPlugin,
  MbHaasEffectPlugin,
  MbSpatialEnhancerPlugin,
  Mb3dPannerPlugin,
  MbBinauralPlugin,
  MbSurroundEncoderPlugin,
  MbCorrelationMeterPlugin,
  MbMidSideProcPlugin,
  MbStereoCrossfeedPlugin,
  MbStereoBalancePlugin,
  MbStereoRotationPlugin,
  MbStereoDopplerPlugin,
  MbLoudnessMaxPlugin,
  MbMasterStereoPlugin,
  MbMultibandStereoPlugin,
  MbDitherPlugin,
  MbSrcPlugin,
  MbTruePeakLimiterPlugin,
  MbBrickwallLimiterPlugin,
  MbIspLimiterPlugin,
  MbMeteringPlugin,
  MbMasterChainPlugin,
  MbMasterDeesserPlugin,
  MbMasterTiltPlugin,
  MbMasterKWeightPlugin,
  MbMasterReferencePlugin,
  MbFilterLpPlugin,
  MbFilterHpPlugin,
  MbFilterBpPlugin,
  MbFilterNotchPlugin,
  MbFilterCombPlugin,
  MbFilterAllpassPlugin,
  MbFilterFormantPlugin,
  MbFilterWahPlugin,
  MbFilterAutowahPlugin,
  MbFilterSweepPlugin,
  MbFilterTalkboxPlugin,
  MbFilterLadderPlugin,
  MbFilterStateVarPlugin,
  MbUtilGainPlugin,
  MbUtilPanPlugin,
  MbUtilPhasePlugin,
  MbUtilPolarityPlugin,
  MbUtilMonoPlugin,
  MbUtilDcoffsetPlugin,
  MbUtilTesttonePlugin,
  MbUtilSpectrumPlugin,
  MbUtilOscilloscopePlugin,
  MbUtilTunerPlugin,
  MbUtilTrimPlugin,
  MbUtilDelayCompPlugin,
  MbUtilAbSwitchPlugin,
  MbCreativeGrandelayPlugin,
  MbCreativePitchshiftPlugin,
  MbCreativeFreqshiftPlugin,
  MbCreativeHarmonicsPlugin,
  MbCreativeSubenhancePlugin,
  MbCreativeBassenhancePlugin,
  MbCreativeExciterPlugin,
  MbCreativePsychoPlugin,
  MbCreativeSaturationPlugin,
  MbCreativeRingmodPlugin,
  MbCreativeVocoderPlugin,
  MbCreativeSpectralGatePlugin,
  MbCreativeSampleHoldPlugin,
  MbTimeStretchPlugin,
  MbTimePitchtimePlugin,
  MbTimeVarispeedPlugin,
  MbTimeReversePlugin,
  MbTimeFreezePlugin,
  MbTimeStutterPlugin,
  MbTimeBeatrepeatPlugin,
  MbTimeSlicePlugin,
  MbTimeRetriggerPlugin,
  MbTimeGateseqPlugin,
  MbTimeGrainDelayPlugin,
  MbTimeLooperPlugin,
  MbTimeScatterPlugin,
  MbTimeTapeLoopPlugin,
  MbRestoreNrPlugin,
  MbRestoreDehumPlugin,
  MbRestoreDeclickPlugin,
  MbRestoreDecracklePlugin,
  MbRestoreDeclipPlugin,
  MbRestoreSpectralPlugin,
  MbRestoreDialoguePlugin,
  MbRestoreHissPlugin,
  MbRestoreRumblePlugin,
  MbRestoreDepopPlugin,
  MbRestoreWindPlugin,
  MbRestoreBroadbandPlugin,
  MbRestoreMouthDeclickPlugin,
  MbRestorePhaseCorrectPlugin,
  MbReverbPlugin,
  MbDelayPlugin,
  MbChorusPlugin,
  MbCompressorPlugin,
  MbEqPlugin,
  MbLimiterPlugin,
  MbGatePlugin,
  MbDistortionPlugin,
  MbPhaserPlugin,
  MbFlangerPlugin,
  MbMixConsolePlugin,
  MbMixSummingPlugin,
  MbMixTapeMachinePlugin,
  MbMixVcaGroupPlugin,
  MbMixBusCompPlugin,
  MbMixSendFxPlugin,
  MbMixTransformerPlugin,
  MbMixMonitorPlugin,
  MbMixParallelPlugin,
  MbMixHeadphonePlugin,
  MbBrassTrumpetPlugin,
  MbBrassTrombonePlugin,
  MbBrassFrenchhornPlugin,
  MbBrassTubaPlugin,
  MbBrassSaxAltoPlugin,
  MbBrassSaxTenorPlugin,
  MbBrassSaxSopranoPlugin,
  MbBrassSaxBariPlugin,
  MbBrassEnsemblePlugin,
  MbBrassFlugelhornPlugin,
  MbBrassCornetPlugin,
  MbBrassEuphoniumPlugin,
  MbBrassMutedTrumpetPlugin,
  MbWoodwindFlutePlugin,
  MbWoodwindClarinetPlugin,
  MbWoodwindOboePlugin,
  MbWoodwindBassoonPlugin,
  MbWoodwindPiccoloPlugin,
  MbWoodwindRecorderPlugin,
  MbWoodwindPanflutePlugin,
  MbWoodwindShakuhachiPlugin,
  MbWoodwindEnglishHornPlugin,
  MbWoodwindHarmonicaPlugin,
  MbWoodwindBagpipePlugin,
  MbWoodwindAccordionPlugin,
  MbOrganPipePlugin,
  MbOrganHammondPlugin,
  MbOrganChurchPlugin,
  MbOrganComboPlugin,
  MbOrganTransistorPlugin,
  MbOrganReedPlugin,
  MbOrganGospelPlugin,
  MbOrganFarfisaPlugin,
  MbGuitarAcousticPlugin,
  MbGuitarElectricCleanPlugin,
  MbGuitarElectricDirtyPlugin,
  MbGuitarNylonPlugin,
  MbGuitar12stringPlugin,
  MbGuitarSlidePlugin,
  MbGuitarSteelPlugin,
  MbGuitarBassElectricPlugin,
  MbGuitarBanjoPlugin,
  MbGuitarUkulelePlugin,
  MbGuitarMandolinPlugin,
  MbGuitarResonatorPlugin,
  MbGuitarSitarElectricPlugin,
  MbMalletVibraphonePlugin,
  MbMalletMarimbaPlugin,
  MbMalletXylophonePlugin,
  MbMalletGlockenspielPlugin,
  MbMalletCelestaPlugin,
  MbMalletMusicboxPlugin,
  MbMalletKalimbaPlugin,
  MbMalletHarpPlugin,
  MbMalletSteelpanPlugin,
  MbMalletDulcimerPlugin,
  MbMalletBalafonPlugin,
  MbMalletCrotalesPlugin,
  MbEthnicSitarPlugin,
  MbEthnicKotoPlugin,
  MbEthnicErhuPlugin,
  MbEthnicDudukPlugin,
  MbEthnicOudPlugin,
  MbEthnicBalalaikaPlugin,
  MbEthnicDidgeridooPlugin,
  MbEthnicMbiraPlugin,
  MbEthnicGamelanPlugin,
  MbEthnicTablaPlugin,
  MbEthnicSantoorPlugin,
  MbEthnicBouzoukiPlugin,
  MbEthnicGuzhengPlugin,
  MbEthnicShamisenPlugin,
  MbEthnicCharangoPlugin,
  MbEthnicDiziPlugin,
  MbEthnicDjembePlugin,
  MbEthnicZurnaPlugin,
  MbVocalChoirPlugin,
  MbVocalVocoderSynthPlugin,
  MbVocalTalkboxPlugin,
  MbVocalFormantSynthPlugin,
  MbVocalSopranoPlugin,
  MbVocalBassVoicePlugin,
  MbVocalWhisperPlugin,
  MbVocalRobotPlugin,
  MbBellTubularPlugin,
  MbBellChimesPlugin,
  MbBellSteeldrumPlugin,
  MbBellChurchbellPlugin,
  MbBellHandbellPlugin,
  MbBellTibetanPlugin,
  MbBellCrystalBowlPlugin,
  MbBellGongPlugin,
  MbPianoPlugin,
  MbStringsPlugin,
  MbDrumsPlugin,
  MbBassPlugin,
  MbPadPlugin,
  MbAnalogSynthPlugin,
  MbFmSynthPlugin,
  MbWavetableSynthPlugin,
  MbSamplerPlugin,
];

export default ALL_PLUGINS;
