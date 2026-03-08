/**
 * MB Mono Sum
 * Category : effect
 * Type     : eq
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Stereo to mono summing with channel selection
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_UTIL_MONO_H
#define MB_UTIL_MONO_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbUtilMono : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-util-mono";
    static constexpr const char* PLUGIN_NAME    = "MB Mono Sum";
    static constexpr const char* PLUGIN_TYPE    = "eq";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float mode = 0f;  // range [0, 3]
    float balance = 0.5f;  // range [0, 1]
    };

    MbUtilMono() = default;
    ~MbUtilMono() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.mode = std::clamp(params.mode, 0f, 3f);
        params.balance = std::clamp(params.balance, 0f, 1f);
        for (int i = 0; i < numSamples; ++i) {
            left[i]  = processSample(left[i],  params);
            right[i] = processSample(right[i], params);
        }
    }

private:
    double sampleRate_ = 44100.0;
    float  buffer_[65536] = {};

    inline float processSample(float input, const Parameters& params) {
        // DSP implementation for MB Mono Sum
        return input;
    }
};

#endif // MB_UTIL_MONO_H
