/**
 * MB Evolving Pad
 * Category : instrument
 * Type     : wavetable
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Slowly morphing wavetable pad
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_WT_EVOLVING_H
#define MB_WT_EVOLVING_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbWtEvolving : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-wt-evolving";
    static constexpr const char* PLUGIN_NAME    = "MB Evolving Pad";
    static constexpr const char* PLUGIN_TYPE    = "wavetable";
    static constexpr const char* PLUGIN_CATEGORY = "instrument";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float position = 0f;  // range [0, 1]
    float lfoRate = 0.1f;  // range [0.01, 2]
    float volume = 0.7f;  // range [0, 1]
    };

    MbWtEvolving() = default;
    ~MbWtEvolving() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.position = std::clamp(params.position, 0f, 1f);
        params.lfoRate = std::clamp(params.lfoRate, 0.01f, 2f);
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
        // DSP implementation for MB Evolving Pad
        return input;
    }
};

#endif // MB_WT_EVOLVING_H
