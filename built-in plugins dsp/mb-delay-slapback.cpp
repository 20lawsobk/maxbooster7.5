/**
 * MB Slapback
 * Category : effect
 * Type     : delay
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Short slapback echo
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_DELAY_SLAPBACK_H
#define MB_DELAY_SLAPBACK_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbDelaySlapback : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-delay-slapback";
    static constexpr const char* PLUGIN_NAME    = "MB Slapback";
    static constexpr const char* PLUGIN_TYPE    = "delay";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float time = 80f;  // range [30, 150]
    float feedback = 0.1f;  // range [0, 0.5]
    float mix = 0.4f;  // range [0, 1]
    };

    MbDelaySlapback() = default;
    ~MbDelaySlapback() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.time = std::clamp(params.time, 30f, 150f);
        params.feedback = std::clamp(params.feedback, 0f, 0.5f);
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
        // DSP implementation for MB Slapback
        return input;
    }
};

#endif // MB_DELAY_SLAPBACK_H
