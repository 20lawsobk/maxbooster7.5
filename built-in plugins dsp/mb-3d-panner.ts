import type { PluginDefinition } from '../server/services/pluginHostService';

const Mb-3dPannerPlugin: PluginDefinition = { id: 'mb-3d-panner', slug: 'mb-3d-panner', name: 'MB 3D Panner', category: 'effect', type: 'stereo' as any, version: '1.0.0', description: '3D spatial panning with distance and elevation control', author: 'Max Booster', parameters: [{ id: 'azimuth', name: 'Azimuth', type: 'float', defaultValue: 0, minValue: -180, maxValue: 180, automatable: true }, { id: 'elevation', name: 'Elevation', type: 'float', defaultValue: 0, minValue: -90, maxValue: 90, automatable: true }, { id: 'distance', name: 'Distance', type: 'float', defaultValue: 1, minValue: 0.1, maxValue: 10, automatable: true }, { id: 'roomSize', name: 'Room Size', type: 'float', defaultValue: 0.5, minValue: 0, maxValue: 1, automatable: true }], defaultPreset: { azimuth: 0, elevation: 0, distance: 1, roomSize: 0.5 } };

export default Mb-3dPannerPlugin;
