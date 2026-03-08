/**
 * MB FM Electric Piano
 * Category : instrument
 * Type     : fm
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Classic DX7-style FM electric piano with warm tines and bells
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_FM_ELECTRIC_PIANO_H
#define MB_FM_ELECTRIC_PIANO_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbFmElectricPiano : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-fm-electric-piano";
    static constexpr const char* PLUGIN_NAME    = "MB FM Electric Piano";
    static constexpr const char* PLUGIN_TYPE    = "fm";
    static constexpr const char* PLUGIN_CATEGORY = "instrument";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float algorithm = 1f;  // range [1, 32]
    float mod_index = 2.5f;  // range [0, 10]
    float ratio = 14f;  // range [0.5, 32]
    float brightness = 0.6f;  // range [0, 1]
    float decay = 2.0f;  // range [0.1, 10]
    float velocity_sens = 0.7f;  // range [0, 1]
    float tremolo_rate = 5f;  // range [0, 20]
    float tremolo_depth = 0.3f;  // range [0, 1]
    float volume = 0.8f;  // range [0, 1]
    };

    MbFmElectricPiano() = default;
    ~MbFmElectricPiano() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.algorithm = std::clamp(params.algorithm, 1f, 32f);
        params.mod_index = std::clamp(params.mod_index, 0f, 10f);
        params.ratio = std::clamp(params.ratio, 0.5f, 32f);
        params.brightness = std::clamp(params.brightness, 0f, 1f);
        params.decay = std::clamp(params.decay, 0.1f, 10f);
        params.velocity_sens = std::clamp(params.velocity_sens, 0f, 1f);
        params.tremolo_rate = std::clamp(params.tremolo_rate, 0f, 20f);
        params.tremolo_depth = std::clamp(params.tremolo_depth, 0f, 1f);
        params.volume = std::clamp(params.volume, 0f, 1f);
        for (int i = 0; i < numSamples; ++i) {
            left[i]  = processSample(left[i],  params);
            right[i] = processSample(right[i], params);
        }
    }

private:
    double sampleRate_ = 44100.0;
    float  buffer_[65536] = {};

    inline float processSample(float input, const Parameters& params) {
        // DSP implementation for MB FM Electric Piano
        return input;
    }
};

#endif // MB_FM_ELECTRIC_PIANO_H
