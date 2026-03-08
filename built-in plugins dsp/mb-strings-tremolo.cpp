/**
 * MB Tremolo Strings
 * Category : instrument
 * Type     : strings
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Dramatic tremolo strings
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_STRINGS_TREMOLO_H
#define MB_STRINGS_TREMOLO_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbStringsTremolo : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-strings-tremolo";
    static constexpr const char* PLUGIN_NAME    = "MB Tremolo Strings";
    static constexpr const char* PLUGIN_TYPE    = "strings";
    static constexpr const char* PLUGIN_CATEGORY = "instrument";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float speed = 8f;  // range [4, 16]
    float volume = 0.8f;  // range [0, 1]
    };

    MbStringsTremolo() = default;
    ~MbStringsTremolo() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.speed = std::clamp(params.speed, 4f, 16f);
        params.volume = std::clamp(params.volume, 0f, 1f);
        for (int i = 0; i < numSamples; ++i) {
            left[i]  = processSample(left[i],  params);
            right[i] = processSample(right[i], params);
        }
    }

private:
    double sampleRate_ = 44100.0;
    float  buffer_[65536] = {};

    inline float processSample(float input, const Parameters& params) {
        // DSP implementation for MB Tremolo Strings
        return input;
    }
};

#endif // MB_STRINGS_TREMOLO_H
