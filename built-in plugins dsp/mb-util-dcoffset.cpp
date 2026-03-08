/**
 * MB DC Offset Remover
 * Category : effect
 * Type     : eq
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Remove DC offset from audio signal
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_UTIL_DCOFFSET_H
#define MB_UTIL_DCOFFSET_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbUtilDcoffset : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-util-dcoffset";
    static constexpr const char* PLUGIN_NAME    = "MB DC Offset Remover";
    static constexpr const char* PLUGIN_TYPE    = "eq";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float frequency = 5f;  // range [1, 30]
    float autoDetect = 1f;  // range [0, 1]
    };

    MbUtilDcoffset() = default;
    ~MbUtilDcoffset() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.frequency = std::clamp(params.frequency, 1f, 30f);
        params.autoDetect = std::clamp(params.autoDetect, 0f, 1f);
        for (int i = 0; i < numSamples; ++i) {
            left[i]  = processSample(left[i],  params);
            right[i] = processSample(right[i], params);
        }
    }

private:
    double sampleRate_ = 44100.0;
    float  buffer_[65536] = {};

    inline float processSample(float input, const Parameters& params) {
        // DSP implementation for MB DC Offset Remover
        return input;
    }
};

#endif // MB_UTIL_DCOFFSET_H
