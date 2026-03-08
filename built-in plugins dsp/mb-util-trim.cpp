/**
 * MB Trim
 * Category : effect
 * Type     : eq
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Simple gain trim with channel swap and balance
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_UTIL_TRIM_H
#define MB_UTIL_TRIM_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbUtilTrim : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-util-trim";
    static constexpr const char* PLUGIN_NAME    = "MB Trim";
    static constexpr const char* PLUGIN_TYPE    = "eq";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float gainL = 0f;  // range [-24, 24]
    float gainR = 0f;  // range [-24, 24]
    float swap = 0f;  // range [0, 1]
    };

    MbUtilTrim() = default;
    ~MbUtilTrim() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.gainL = std::clamp(params.gainL, -24f, 24f);
        params.gainR = std::clamp(params.gainR, -24f, 24f);
        params.swap = std::clamp(params.swap, 0f, 1f);
        for (int i = 0; i < numSamples; ++i) {
            left[i]  = processSample(left[i],  params);
            right[i] = processSample(right[i], params);
        }
    }

private:
    double sampleRate_ = 44100.0;
    float  buffer_[65536] = {};

    inline float processSample(float input, const Parameters& params) {
        // DSP implementation for MB Trim
        return input;
    }
};

#endif // MB_UTIL_TRIM_H
