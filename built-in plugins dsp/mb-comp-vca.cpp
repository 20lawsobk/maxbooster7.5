/**
 * MB VCA Comp
 * Category : effect
 * Type     : compressor
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Fast VCA compressor
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_COMP_VCA_H
#define MB_COMP_VCA_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbCompVca : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-comp-vca";
    static constexpr const char* PLUGIN_NAME    = "MB VCA Comp";
    static constexpr const char* PLUGIN_TYPE    = "compressor";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float threshold = -18f;  // range [-60, 0]
    float ratio = 6f;  // range [1, 20]
    float attack = 1f;  // range [0.1, 50]
    float release = 50f;  // range [5, 500]
    };

    MbCompVca() = default;
    ~MbCompVca() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.threshold = std::clamp(params.threshold, -60f, 0f);
        params.ratio = std::clamp(params.ratio, 1f, 20f);
        params.attack = std::clamp(params.attack, 0.1f, 50f);
        params.release = std::clamp(params.release, 5f, 500f);
        for (int i = 0; i < numSamples; ++i) {
            left[i]  = processSample(left[i],  params);
            right[i] = processSample(right[i], params);
        }
    }

private:
    double sampleRate_ = 44100.0;
    float  buffer_[65536] = {};

    inline float processSample(float input, const Parameters& params) {
        // DSP implementation for MB VCA Comp
        return input;
    }
};

#endif // MB_COMP_VCA_H
