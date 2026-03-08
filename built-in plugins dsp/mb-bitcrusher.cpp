/**
 * MB Bitcrusher
 * Category : effect
 * Type     : distortion
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Bit reduction and sample rate destruction for lo-fi effects
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_BITCRUSHER_H
#define MB_BITCRUSHER_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbBitcrusher : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-bitcrusher";
    static constexpr const char* PLUGIN_NAME    = "MB Bitcrusher";
    static constexpr const char* PLUGIN_TYPE    = "distortion";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float bit_depth = 16f;  // range [1, 16]
    float sample_rate = 44100f;  // range [100, 44100]
    float jitter = 0f;  // range [0, 1]
    float drive = 0f;  // range [0, 24]
    float mix = 1f;  // range [0, 1]
    };

    MbBitcrusher() = default;
    ~MbBitcrusher() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.bit_depth = std::clamp(params.bit_depth, 1f, 16f);
        params.sample_rate = std::clamp(params.sample_rate, 100f, 44100f);
        params.jitter = std::clamp(params.jitter, 0f, 1f);
        params.drive = std::clamp(params.drive, 0f, 24f);
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

#endif // MB_BITCRUSHER_H
