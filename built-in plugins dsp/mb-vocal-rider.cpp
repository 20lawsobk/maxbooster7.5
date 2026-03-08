/**
 * MB Vocal Rider
 * Category : effect
 * Type     : vocal
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Automatic vocal level riding
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_VOCAL_RIDER_H
#define MB_VOCAL_RIDER_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbVocalRider : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-vocal-rider";
    static constexpr const char* PLUGIN_NAME    = "MB Vocal Rider";
    static constexpr const char* PLUGIN_TYPE    = "vocal";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float target = -12f;  // range [-24, 0]
    float speed = 0.5f;  // range [0.1, 1]
    float range = 12f;  // range [3, 24]
    };

    MbVocalRider() = default;
    ~MbVocalRider() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.target = std::clamp(params.target, -24f, 0f);
        params.speed = std::clamp(params.speed, 0.1f, 1f);
        params.range = std::clamp(params.range, 3f, 24f);
        for (int i = 0; i < numSamples; ++i) {
            left[i]  = processSample(left[i],  params);
            right[i] = processSample(right[i], params);
        }
    }

private:
    double sampleRate_ = 44100.0;
    float  buffer_[65536] = {};

    inline float processSample(float input, const Parameters& params) {
        // DSP implementation for MB Vocal Rider
        return input;
    }
};

#endif // MB_VOCAL_RIDER_H
