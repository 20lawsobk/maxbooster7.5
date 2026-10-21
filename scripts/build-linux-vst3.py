#!/usr/bin/env python3
"""Build the original JUCE plugin for Linux; never substitute the Windows DLL.

The source project and JUCE checkout are explicit inputs. A .jucer project is
translated using its original source list, plugin identity and module list.
"""
import argparse
import json
import os
import pathlib
import platform
import re
import shutil
import subprocess
import sys
import xml.etree.ElementTree as ET


def quote(value):
    value = str(value)
    if any(c in value for c in (';', '\n', '\r', '"', '$')):
        raise ValueError('Unsupported CMake path or metadata character')
    return '"' + value.replace('\\', '/') + '"'


def configure(project, juce, output):
    tree = ET.parse(project).getroot()
    if tree.tag != 'JUCERPROJECT' or tree.get('projectType') != 'audioplug':
        raise ValueError('Expected the original JUCE audio plugin project')
    required = ['pluginCode', 'pluginManufacturerCode', 'pluginName', 'version']
    if any(not tree.get(k) for k in required):
        raise ValueError('Original plugin identity is incomplete; refusing to invent identifiers')
    for key in ['pluginCode', 'pluginManufacturerCode']:
        if not re.fullmatch(r'[A-Za-z0-9]{4}', tree.get(key)):
            raise ValueError('Original JUCE plugin identifiers must be four alphanumeric characters')
    sources = []
    resources = []
    for file in tree.iter('FILE'):
        name = file.get('file')
        if not name:
            continue
        source = (project.parent / name).resolve()
        if file.get('compile') == '1' and source.suffix.lower() in ('.cpp', '.cc', '.cxx', '.c'):
            if not source.is_file():
                raise ValueError('An original plugin compilation unit is missing')
            sources.append(source)
        if file.get('resource') == '1':
            if not source.is_file():
                raise ValueError('An original plugin resource is missing')
            resources.append(source)
    if not sources:
        raise ValueError('No original C/C++ plugin compilation units are present')
    modules = [m.get('id') for m in tree.iter('MODULE')]
    if not modules or any(not m or not m.startswith('juce_') or not m.replace('_', '').isalnum() for m in modules):
        raise ValueError('The original JUCE module list is missing or invalid')
    output.mkdir(parents=True, exist_ok=True)
    flags = set((tree.get('pluginCharacteristicsValue') or '').split(','))
    enabled = lambda key: 'TRUE' if tree.get(key) == '1' or key in flags else 'FALSE'
    lines = ['cmake_minimum_required(VERSION 3.22)', 'project(MaxBoosterLinuxPlugin LANGUAGES C CXX)',
             'set(CMAKE_CXX_STANDARD 17)', 'set(CMAKE_POSITION_INDEPENDENT_CODE ON)',
             f'add_subdirectory({quote(juce)} juce)', 'juce_add_plugin(MaxBoosterNative',
             '  FORMATS VST3', f'  PRODUCT_NAME {quote(tree.get("pluginName"))}',
             f'  VERSION {quote(tree.get("version"))}',
             f'  PLUGIN_CODE {tree.get("pluginCode")}', f'  PLUGIN_MANUFACTURER_CODE {tree.get("pluginManufacturerCode")}',
             f'  COMPANY_NAME {quote(tree.get("companyName", ""))}',
             f'  IS_SYNTH {enabled("pluginIsSynth")}',
             f'  NEEDS_MIDI_INPUT {enabled("pluginWantsMidiIn")}',
             f'  NEEDS_MIDI_OUTPUT {enabled("pluginProducesMidiOut")}',
             '  COPY_PLUGIN_AFTER_BUILD FALSE)', 'juce_generate_juce_header(MaxBoosterNative)',
             'target_sources(MaxBoosterNative PRIVATE ' + ' '.join(quote(s) for s in sources) + ')',
             'target_include_directories(MaxBoosterNative PRIVATE ' + quote(project.parent / 'Source') + ')',
             'target_link_libraries(MaxBoosterNative PRIVATE ' + ' '.join('juce::' + m for m in modules) + ')']
    if resources:
        lines += ['juce_add_binary_data(MaxBoosterBinaryData SOURCES ' + ' '.join(quote(s) for s in resources) + ')',
                  'target_link_libraries(MaxBoosterNative PRIVATE MaxBoosterBinaryData)']
    definitions = (tree.get('defines') or '').split()
    if definitions:
        lines += ['target_compile_definitions(MaxBoosterNative PRIVATE ' + ' '.join(quote(d) for d in definitions) + ')']
    (output / 'CMakeLists.txt').write_text('\n'.join(lines) + '\n')
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', type=pathlib.Path, default=pathlib.Path('VST3/NewProject.jucer'))
    parser.add_argument('--juce', type=pathlib.Path, default=os.environ.get('MAXBOOSTER_JUCE_SOURCE'))
    parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path('.local/linux-vst3-build'))
    parser.add_argument('--configure-only', action='store_true')
    args = parser.parse_args()
    try:
        if platform.system() != 'Linux' or platform.machine() not in ('x86_64', 'AMD64'):
            raise ValueError('This build profile targets Linux x86_64')
        if not args.project.is_file():
            raise ValueError('Original .jucer source project is missing from VST3; Windows binaries and build logs cannot be recompiled')
        if not args.juce or not (args.juce / 'CMakeLists.txt').is_file():
            raise ValueError('Pass --juce with the compatible original JUCE source checkout')
        generated = configure(args.project.resolve(), args.juce.resolve(), args.output.resolve() / 'project')
        if args.configure_only:
            print(json.dumps({'configured': True, 'built': False, 'project': str(generated)}))
            return 0
        for tool in ['cmake', 'c++', 'pkg-config', 'readelf']:
            if not shutil.which(tool):
                raise ValueError('Linux build dependency is missing: ' + tool)
        build = args.output.resolve() / 'build'
        subprocess.run(['cmake', '-S', str(generated), '-B', str(build), '-DCMAKE_BUILD_TYPE=Release'], check=True)
        subprocess.run(['cmake', '--build', str(build), '--target', 'MaxBoosterNative_VST3', '--parallel', '2'], check=True)
        binaries = list(build.glob('**/*.vst3/Contents/x86_64-linux/*.so'))
        if len(binaries) != 1:
            raise ValueError('Expected exactly one compiled Linux VST3 shared object')
        binary = binaries[0]
        if binary.read_bytes()[:4] != b'\x7fELF':
            raise ValueError('The VST3 output is not an ELF shared object')
        symbols = subprocess.check_output(['readelf', '--dyn-syms', '--wide', str(binary)], text=True)
        if not any('GetPluginFactory' in line and ' UND ' not in line for line in symbols.splitlines()):
            raise ValueError('Linux VST3 output does not export GetPluginFactory')
        print(json.dumps({'built': True, 'binary': str(binary), 'processingVerified': False,
                          'note': 'Native host validation and DSP parity checks are still required'}))
        return 0
    except (ValueError, ET.ParseError, OSError, subprocess.CalledProcessError) as error:
        print('Linux VST3 build blocked: ' + str(error), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
