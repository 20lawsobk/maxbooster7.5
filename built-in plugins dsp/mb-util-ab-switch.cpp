/**
 * MB A/B Switch
 * Category : effect
 * Type     : eq
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Quick A/B comparison switch for effect chain bypass
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_UTIL_AB_SWITCH_H
#define MB_UTIL_AB_SWITCH_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbUtilAbSwitch : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-util-ab-switch";
    static constexpr const char* PLUGIN_NAME    = "MB A/B Switch";
    static constexpr const char* PLUGIN_TYPE    = "eq";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float position = 0f;  // range [0, 1]
    float gainComp = 0f;  // range [-12, 12]
    };

    MbUtilAbSwitch() = default;
    ~MbUtilAbSwitch() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.position = std::clamp(params.position, 0f, 1f);
        params.gainComp = std::clamp(params.gainComp, -12f, 12f);
        for (int i = 0; i < numSamples; ++i) {
            left[i]  = processSample(left[i],  params);
            right[i] = processSample(right[i], params);
        }
    }

private:
    double sampleRate_ = 44100.0;
    float  buffer_[65536] = {};

    inline float processSample(float input, const Parameters& params) {
        // DSP implementation for MB A/B Switch
        return input;
    }
};

#endif // MB_UTIL_AB_SWITCH_H
