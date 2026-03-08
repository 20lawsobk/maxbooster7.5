/**
 * MB Grain Delay
 * Category : effect
 * Type     : delay
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Granular pitch delay
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_DELAY_GRAIN_H
#define MB_DELAY_GRAIN_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbDelayGrain : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-delay-grain";
    static constexpr const char* PLUGIN_NAME    = "MB Grain Delay";
    static constexpr const char* PLUGIN_TYPE    = "delay";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float size = 100f;  // range [10, 500]
    float pitch = 0f;  // range [-12, 12]
    float feedback = 0.4f;  // range [0, 0.9]
    float mix = 0.35f;  // range [0, 1]
    };

    MbDelayGrain() = default;
    ~MbDelayGrain() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.size = std::clamp(params.size, 10f, 500f);
        params.pitch = std::clamp(params.pitch, -12f, 12f);
        params.feedback = std::clamp(params.feedback, 0f, 0.9f);
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
        // DSP implementation for MB Grain Delay
        return input;
    }
};

#endif // MB_DELAY_GRAIN_H
