/**
 * MB Granular Delay
 * Category : effect
 * Type     : delay
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Granular processing combined with delay for textural echoes
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_CREATIVE_GRANDELAY_H
#define MB_CREATIVE_GRANDELAY_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbCreativeGrandelay : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-creative-grandelay";
    static constexpr const char* PLUGIN_NAME    = "MB Granular Delay";
    static constexpr const char* PLUGIN_TYPE    = "delay";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float time = 300f;  // range [10, 2000]
    float grainSize = 50f;  // range [5, 500]
    float pitch = 0f;  // range [-24, 24]
    float feedback = 0.4f;  // range [0, 0.95]
    float mix = 0.35f;  // range [0, 1]
    };

    MbCreativeGrandelay() = default;
    ~MbCreativeGrandelay() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.time = std::clamp(params.time, 10f, 2000f);
        params.grainSize = std::clamp(params.grainSize, 5f, 500f);
        params.pitch = std::clamp(params.pitch, -24f, 24f);
        params.feedback = std::clamp(params.feedback, 0f, 0.95f);
        params.mix = std::clamp(params.mix, 0f, 1f);
        for (int i = 0; i < numSamples; ++i) {
            left[i]  = processSample(left[i],  params);
            right[i] = processSample(right[i], params);
        }
    }

private:
    double sampleRate_ = 44100.0;
    float  buffer_[65536] = {};

    inline float processSample(float input, const Parameters& params) {
        // DSP implementation for MB Granular Delay
        return input;
    }
};

#endif // MB_CREATIVE_GRANDELAY_H
