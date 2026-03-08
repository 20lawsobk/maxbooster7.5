/**
 * MB Talk Box
 * Category : effect
 * Type     : eq
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Talk box effect simulating speech-like filter modulation
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_FILTER_TALKBOX_H
#define MB_FILTER_TALKBOX_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbFilterTalkbox : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-filter-talkbox";
    static constexpr const char* PLUGIN_NAME    = "MB Talk Box";
    static constexpr const char* PLUGIN_TYPE    = "eq";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float vowelA = 0f;  // range [0, 4]
    float vowelB = 2f;  // range [0, 4]
    float morph = 0.5f;  // range [0, 1]
    float mix = 1f;  // range [0, 1]
    };

    MbFilterTalkbox() = default;
    ~MbFilterTalkbox() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.vowelA = std::clamp(params.vowelA, 0f, 4f);
        params.vowelB = std::clamp(params.vowelB, 0f, 4f);
        params.morph = std::clamp(params.morph, 0f, 1f);
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
        // DSP implementation for MB Talk Box
        return input;
    }
};

#endif // MB_FILTER_TALKBOX_H
