/**
 * MB WT Arp
 * Category : instrument
 * Type     : wavetable
 * Version  : 1.0.0
 * Author   : Max Booster
 * Desc     : Wavetable arpeggiated sounds
 *
 * Part of Max Booster Built-In Plugins DSP
 */

#ifndef MB_WT_ARP_H
#define MB_WT_ARP_H

#include <algorithm>
#include <cmath>
#include <cstring>
#include "PluginBase.h"

class MbWtArp : public PluginBase {
public:
    static constexpr const char* PLUGIN_ID      = "mb-wt-arp";
    static constexpr const char* PLUGIN_NAME    = "MB WT Arp";
    static constexpr const char* PLUGIN_TYPE    = "wavetable";
    static constexpr const char* PLUGIN_CATEGORY = "instrument";
    static constexpr const char* VERSION         = "1.0.0";

    struct Parameters {
    float position = 0.6f;  // range [0, 1]
    float cutoff = 5000f;  // range [200, 15000]
    float volume = 0.8f;  // range [0, 1]
    };

    MbWtArp() = default;
    ~MbWtArp() override = default;

    void setSampleRate(double sampleRate) override {
        sampleRate_ = sampleRate;
        reset();
    }

    void reset() override {
        std::memset(buffer_, 0, sizeof(buffer_));
    }

    void process(float* left, float* right, int numSamples, Parameters params) {
        params.position = std::clamp(params.position, 0f, 1f);
        params.cutoff = std::clamp(params.cutoff, 200f, 15000f);
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
        // DSP implementation for MB WT Arp
        return input;
    }
};

#endif // MB_WT_ARP_H
