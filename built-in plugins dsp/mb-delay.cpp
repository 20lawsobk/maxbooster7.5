/**
 * MB Delay
 * Category : effect
 * Type     : delay
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Stereo delay with sync and modulation
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_DELAY_H
#define MB_DELAY_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbDelay : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-delay";
    static constexpr const char* PLUGIN_NAME    = "MB Delay";
    static constexpr const char* PLUGIN_TYPE    = "delay";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float timeLeft = 250f;  // range [1, 2000]
    float timeRight = 375f;  // range [1, 2000]
    float feedback = 0.4f;  // range [0, 0.95]
    float highCut = 6000f;  // range [500, 20000]
    float modRate = 0.5f;  // range [0, 5]
    float modDepth = 0.1f;  // range [0, 1]
    float mix = 0.3f;  // range [0, 1]
    };

    MbDelay() = default;
    ~MbDelay() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.timeLeft = std::clamp(params.timeLeft, 1f, 2000f);
        params.timeRight = std::clamp(params.timeRight, 1f, 2000f);
        params.feedback = std::clamp(params.feedback, 0f, 0.95f);
        params.highCut = std::clamp(params.highCut, 500f, 20000f);
        params.modRate = std::clamp(params.modRate, 0f, 5f);
        params.modDepth = std::clamp(params.modDepth, 0f, 1f);
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
        // DSP implementation for MB Delay
        return input;
    }
};

#endif // MB_DELAY_H
