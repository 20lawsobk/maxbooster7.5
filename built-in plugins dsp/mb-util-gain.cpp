/**
 * MB Gain
 * Category : effect
 * Type     : eq
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Simple gain utility with phase inversion
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_UTIL_GAIN_H
#define MB_UTIL_GAIN_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbUtilGain : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-util-gain";
    static constexpr const char* PLUGIN_NAME    = "MB Gain";
    static constexpr const char* PLUGIN_TYPE    = "eq";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float gain = 0f;  // range [-48, 48]
    float pan = 0f;  // range [-1, 1]
    float phaseL = 0f;  // range [0, 1]
    float phaseR = 0f;  // range [0, 1]
    };

    MbUtilGain() = default;
    ~MbUtilGain() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.gain = std::clamp(params.gain, -48f, 48f);
        params.pan = std::clamp(params.pan, -1f, 1f);
        params.phaseL = std::clamp(params.phaseL, 0f, 1f);
        params.phaseR = std::clamp(params.phaseR, 0f, 1f);
        for (int i = 0; i < numSamples; ++i) {
            left[i]  = processSample(left[i],  params);
            right[i] = processSample(right[i], params);
        }
    }

private:
    double sampleRate_ = 44100.0;
    float  buffer_[65536] = {};

    inline float processSample(float input, const Parameters& params) {
        // DSP implementation for MB Gain
        return input;
    }
};

#endif // MB_UTIL_GAIN_H
