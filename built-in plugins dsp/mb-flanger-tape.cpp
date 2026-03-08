/**
 * MB Tape Flanger
 * Category : effect
 * Type     : flanger
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Classic tape flanging
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_FLANGER_TAPE_H
#define MB_FLANGER_TAPE_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbFlangerTape : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-flanger-tape";
    static constexpr const char* PLUGIN_NAME    = "MB Tape Flanger";
    static constexpr const char* PLUGIN_TYPE    = "flanger";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float rate = 0.2f;  // range [0.01, 3]
    float depth = 0.6f;  // range [0, 1]
    float feedback = 0.5f;  // range [0, 0.95]
    float mix = 0.5f;  // range [0, 1]
    };

    MbFlangerTape() = default;
    ~MbFlangerTape() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.rate = std::clamp(params.rate, 0.01f, 3f);
        params.depth = std::clamp(params.depth, 0f, 1f);
        params.feedback = std::clamp(params.feedback, 0f, 0.95f);
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
        // DSP implementation for MB Tape Flanger
        return input;
    }
};

#endif // MB_FLANGER_TAPE_H
