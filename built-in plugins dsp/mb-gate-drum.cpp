/**
 * MB Drum Gate
 * Category : effect
 * Type     : gate
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Fast drum gating
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_GATE_DRUM_H
#define MB_GATE_DRUM_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbGateDrum : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-gate-drum";
    static constexpr const char* PLUGIN_NAME    = "MB Drum Gate";
    static constexpr const char* PLUGIN_TYPE    = "gate";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float threshold = -25f;  // range [-60, 0]
    float attack = 0.1f;  // range [0.01, 10]
    float hold = 30f;  // range [1, 200]
    float release = 50f;  // range [5, 500]
    };

    MbGateDrum() = default;
    ~MbGateDrum() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.threshold = std::clamp(params.threshold, -60f, 0f);
        params.attack = std::clamp(params.attack, 0.01f, 10f);
        params.hold = std::clamp(params.hold, 1f, 200f);
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
        // DSP implementation for MB Drum Gate
        return input;
    }
};

#endif // MB_GATE_DRUM_H
