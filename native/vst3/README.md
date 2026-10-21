The Linux VST3 build uses the original JUCE source project, rather than the
Windows DLL. From the repository root:

```sh
python3 scripts/build-linux-vst3.py --project VST3/NewProject.jucer --juce /path/to/JUCE
```

`replit.nix` supplies CMake, the C++ compiler, pkg-config and JUCE's Linux system
dependencies. The script retains the source project's plugin and manufacturer
codes, source files, resources and JUCE module list. It stages its generated
CMake project and output under `.local/linux-vst3-build`, outside packaging.
Use the JUCE version compatible with the original project. Platform-specific
C++ source and custom exporter flags may still need porting; inspect the
generated CMake configuration and run DSP parity tests before release.

Current source inspection: `VST3/` contains `NewProject.dll`, its Windows VST3
bundle, PDB and Visual Studio build logs. No `.jucer`, C++ compilation units or
native CMake project exist in this checkout or the archived manifest-helper
capsule. The supplied 9,728-byte Windows DLL has no PE export directory, so it
does not expose the VST3 `GetPluginFactory` entry point either. A matching
moduleinfo manifest is not proof of a loadable plugin.

The build entry point therefore fails explicitly until the original source
project is restored. No Linux binary or native DSP compatibility is claimed.
The web Studio can process supported browser effects through its own insert
chain. Executing a Linux VST3 in that chain additionally requires an actual
native host with authenticated audio transport; the existing bridge does not
provide one. It must not report pass-through audio as successful VST processing.
