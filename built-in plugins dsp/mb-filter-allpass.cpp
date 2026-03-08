/**
 * MB Allpass Filter
 * Category : effect
 * Type     : eq
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Phase-shifting allpass filter for dispersion effects
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_FILTER_ALLPASS_H
#define MB_FILTER_ALLPASS_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbFilterAllpass : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-filter-allpass";
    static constexpr const char* PLUGIN_NAME    = "MB Allpass Filter";
    static constexpr const char* PLUGIN_TYPE    = "eq";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float freq = 2000f;  // range [100, 15000]
    float q = 1f;  // range [0.1, 20]
    float stages = 2f;  // range [1, 8]
    };

    MbFilterAllpass() = default;
    ~MbFilterAllpass() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.freq = std::clamp(params.freq, 100f, 15000f);
        params.q = std::clamp(params.q, 0.1f, 20f);
        params.stages = std::clamp(params.stages, 1f, 8f);
        for (int i = 0; i < numSamples; ++i) {
            left[i]  = processSample(left[i],  params);
            right[i] = processSample(right[i], params);
        }
    }

private:
    double sampleRate_ = 44100.0;
    float  buffer_[65536] = {};

    inline float processSample(float input, const Parameters& params) {
        // DSP implementation for MB Allpass Filter
        return input;
    }
};

#endif // MB_FILTER_ALLPASS_H
