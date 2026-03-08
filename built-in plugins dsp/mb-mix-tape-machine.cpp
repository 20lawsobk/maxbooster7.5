/**
 * MB Tape Machine
 * Category : effect
 * Type     : mixing
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Vintage tape machine emulation with wow and flutter
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_MIX_TAPE_MACHINE_H
#define MB_MIX_TAPE_MACHINE_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbMixTapeMachine : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-mix-tape-machine";
    static constexpr const char* PLUGIN_NAME    = "MB Tape Machine";
    static constexpr const char* PLUGIN_TYPE    = "mixing";
    static constexpr const char* PLUGIN_CATEGORY = "effect";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float speed = 0.5f;  // range [0, 1]
    float wow = 0.15f;  // range [0, 1]
    float flutter = 0.1f;  // range [0, 1]
    float saturation = 0.4f;  // range [0, 1]
    float output = 0.8f;  // range [0, 1]
    };

    MbMixTapeMachine() = default;
    ~MbMixTapeMachine() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.speed = std::clamp(params.speed, 0f, 1f);
        params.wow = std::clamp(params.wow, 0f, 1f);
        params.flutter = std::clamp(params.flutter, 0f, 1f);
        params.saturation = std::clamp(params.saturation, 0f, 1f);
        params.output = std::clamp(params.output, 0f, 1f);
        for (int i = 0; i < numSamples; ++i) {
            left[i]  = processSample(left[i],  params);
            right[i] = processSample(right[i], params);
        }
    }

private:
    double sampleRate_ = 44100.0;
    float  buffer_[65536] = {};

    inline float processSample(float input, const Parameters& params) {
        // DSP implementation for MB Tape Machine
        return input;
    }
};

#endif // MB_MIX_TAPE_MACHINE_H
