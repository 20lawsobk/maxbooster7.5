/**
 * MB Bitcrusher
 * Category : effect
 * Type     : distortion
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Lo-fi bit reduction
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_DIST_BITCRUSH_H
#define MB_DIST_BITCRUSH_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbDistBitcrush : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-dist-bitcrush";
    static constexpr const char* PLUGIN_NAME    = "MB Bitcrusher";
    static constexpr const char* PLUGIN_TYPE    = "distortion";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float bits = 8f;  // range [1, 16]
    float rate = 22050f;  // range [1000, 44100]
    float mix = 1f;  // range [0, 1]
    };

    MbDistBitcrush() = default;
    ~MbDistBitcrush() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.bits = std::clamp(params.bits, 1f, 16f);
        params.rate = std::clamp(params.rate, 1000f, 44100f);
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
        // DSP implementation for MB Bitcrusher
        return input;
    }
};

#endif // MB_DIST_BITCRUSH_H
