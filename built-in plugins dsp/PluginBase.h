/**
 * PluginBase.h — Abstract base class for all Max Booster DSP plugins
 */
#ifndef PLUGIN_BASE_H
#define PLUGIN_BASE_H

class PluginBase {
public:
    virtual ~PluginBase() = default;
    virtual void setSampleRate(double sampleRate) = 0;
    virtual void reset() = 0;
};

#endif // PLUGIN_BASE_H
