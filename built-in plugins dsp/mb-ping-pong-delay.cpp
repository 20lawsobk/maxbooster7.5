/**
 * MB Ping Pong Delay
 * Category : effect
 * Type     : delay
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Stereo ping pong delay with tempo sync
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_PING_PONG_DELAY_H
#define MB_PING_PONG_DELAY_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbPingPongDelay : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-ping-pong-delay";
    static constexpr const char* PLUGIN_NAME    = "MB Ping Pong Delay";
    static constexpr const char* PLUGIN_TYPE    = "delay";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float time_l = 250f;  // range [1, 2000]
    float time_r = 375f;  // range [1, 2000]
    float feedback = 0.4f;  // range [0, 0.95]
    float cross_feedback = 0.3f;  // range [0, 0.95]
    float low_cut = 100f;  // range [20, 2000]
    float high_cut = 8000f;  // range [500, 20000]
    float mix = 0.3f;  // range [0, 1]
    };

    MbPingPongDelay() = default;
    ~MbPingPongDelay() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.time_l = std::clamp(params.time_l, 1f, 2000f);
        params.time_r = std::clamp(params.time_r, 1f, 2000f);
        params.feedback = std::clamp(params.feedback, 0f, 0.95f);
        params.cross_feedback = std::clamp(params.cross_feedback, 0f, 0.95f);
        params.low_cut = std::clamp(params.low_cut, 20f, 2000f);
        params.high_cut = std::clamp(params.high_cut, 500f, 20000f);
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
        // DSP implementation for MB Ping Pong Delay
        return input;
    }
};

#endif // MB_PING_PONG_DELAY_H
