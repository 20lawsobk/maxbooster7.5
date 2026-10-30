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

Current repository source inspection: `VST3/` contains `NewProject.dll`, its Windows VST3
bundle, PDB and Visual Studio build logs. No `.jucer`, C++ compilation units or
native CMake project exist in this checkout or the archived manifest-helper
capsule. The repository's 9,728-byte Windows DLL has no PE export directory, so it
does not expose the VST3 `GetPluginFactory` entry point either. A matching
moduleinfo manifest is not proof of a loadable plugin.

The build entry point therefore fails explicitly until the original source
project is restored. No Linux binary or native DSP compatibility is claimed.
The web Studio can process supported browser effects through its own insert
chain. Executing a Linux VST3 in that chain additionally requires an actual
native host with authenticated audio transport; the existing bridge does not
provide one. It must not report pass-through audio as successful VST processing.

The separately uploaded `Max Booster.dll` is a different 6,390,272-byte Windows
binary. Static inspection finds local executable exports `GetPluginFactory`,
`InitDll` and `ExitDll`. Its SHA-256 is
`b3b03582516da2991fc261a431882f225ce22ff4953852a0ec95d23d770ae5c9`.
It has not been loaded in a native host, and neither its DSP nor its identity
relative to the repository's older bundle has been verified. It has not replaced
the repository binary or been added to the Linux release.

The accompanying `Max Booster_VST3.log` reports
`LINK : fatal error LNK1181: cannot open input file 'NewProject.lib'`.
The supplied 2,118-byte `Max Booster.lib` is an import library for the DLL's three
exports, rather than the missing shared processor library. Renaming it would not
restore the processor implementation. The supplied JUCE wrapper `.obj` references
`createPluginFilter`; it does not provide a buildable JUCE source project. The DLL may
be from a different build attempt than the failed log.

The logs locate the original project above `Builds/VisualStudio2026`, under
`NewProject/`. The needed source package is that project's `.jucer` file (or
original `CMakeLists.txt`), `Source/` with processor, editor and supporting C++
and headers, and any referenced resources, custom modules and dependencies.
Preserve their relative paths and include the JUCE version. Exclude `Builds/`,
DLL/PDB/OBJ/LIB/IOBJ outputs to keep the source archive small. The earlier full
ZIP and the later PDB/IOBJ uploads exceeded the file reader's 32 MiB limit and
could not be inspected.

To inspect a Windows DLL without executing it:

```sh
npm run vst3:inspect -- '/path/to/Max Booster.dll'
npm run test:vst3
```

The inspector follows PE32+ section mappings, export names and ordinals to
file-backed executable addresses. It does not count forwarded names, data
exports or unrelated strings as this binary's VST3 factory. The Studio inventory
uses the same verifier. A successful inspection command means the file could
be inspected; `processingVerified` remains false. Native host validation and
Linux source compilation remain separate requirements.
