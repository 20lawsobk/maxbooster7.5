/**
 * MB Dub Delay
 * Category : effect
 * Type     : delay
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Classic dub echo
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_DELAY_DUB_H
#define MB_DELAY_DUB_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbDelayDub : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-delay-dub";
    static constexpr const char* PLUGIN_NAME    = "MB Dub Delay";
    static constexpr const char* PLUGIN_TYPE    = "delay";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float time = 500f;  // range [100, 2000]
    float feedback = 0.6f;  // range [0, 0.95]
    float filter = 3000f;  // range [500, 10000]
    float mix = 0.4f;  // range [0, 1]
    };

    MbDelayDub() = default;
    ~MbDelayDub() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.time = std::clamp(params.time, 100f, 2000f);
        params.feedback = std::clamp(params.feedback, 0f, 0.95f);
        params.filter = std::clamp(params.filter, 500f, 10000f);
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
        // DSP implementation for MB Dub Delay
        return input;
    }
};

#endif // MB_DELAY_DUB_H
