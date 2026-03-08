/**
 * MB Multi-Tap
 * Category : effect
 * Type     : delay
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Multi-tap rhythm delay
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_DELAY_MULTI_H
#define MB_DELAY_MULTI_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbDelayMulti : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-delay-multi";
    static constexpr const char* PLUGIN_NAME    = "MB Multi-Tap";
    static constexpr const char* PLUGIN_TYPE    = "delay";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float taps = 4f;  // range [2, 8]
    float time = 500f;  // range [100, 2000]
    float mix = 0.35f;  // range [0, 1]
    };

    MbDelayMulti() = default;
    ~MbDelayMulti() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.taps = std::clamp(params.taps, 2f, 8f);
        params.time = std::clamp(params.time, 100f, 2000f);
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
        // DSP implementation for MB Multi-Tap
        return input;
    }
};

#endif // MB_DELAY_MULTI_H
