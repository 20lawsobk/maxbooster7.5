#!/usr/bin/env node
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const virtualStore = path.join(workspace, "node_modules", ".pnpm");
const minimums = [
  { name: "orval", major: 8, version: "8.33.0" },
  { name: "fast-uri", major: 3, version: "3.1.8" },
  { name: "js-yaml", major: 4, version: "4.3.2" },
  { name: "postcss", major: 8, version: "8.5.26" },
  { name: "esbuild", major: 0, version: "0.28.1" },
  { name: "nanoid", major: 3, version: "3.3.18" },
  { name: "ip-address", major: 10, version: "10.7.1" },
  { name: "markdown-it", major: 14, version: "14.3.1" },
  { name: "undici", major: 6, version: "6.28.1" },
  { name: "@xmldom/xmldom", major: 0, version: "0.9.12", optional: true },
  { name: "dompurify", major: 3, version: "3.4.16", optional: true },
];

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function readPackageJson(packagePath) {
  try {
    return JSON.parse(fs.readFileSync(path.join(packagePath, "package.json"), "utf8"));
  } catch {
    return undefined;
  }
}

function packageDirectories(nodeModulesPath) {
  if (!fs.existsSync(nodeModulesPath)) return [];
  const result = [];
  for (const entry of fs.readdirSync(nodeModulesPath, { withFileTypes: true })) {
    if (entry.name.startsWith("@") && entry.isDirectory()) {
      const scope = path.join(nodeModulesPath, entry.name);
      for (const scopedPackage of fs.readdirSync(scope, { withFileTypes: true })) {
        if (scopedPackage.isDirectory()) result.push(path.join(scope, scopedPackage.name));
      }
    } else if (entry.isDirectory() && entry.name !== ".bin") {
      result.push(path.join(nodeModulesPath, entry.name));
    }
  }
  return result;
}

function installedVersions() {
  if (!fs.existsSync(virtualStore)) {
    throw new Error(`pnpm virtual store is missing: ${virtualStore}`);
  }
  const versions = new Map();
  for (const entry of fs.readdirSync(virtualStore, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const modules = path.join(virtualStore, entry.name, "node_modules");
    for (const packagePath of packageDirectories(modules)) {
      const manifest = readPackageJson(packagePath);
      if (!manifest?.name || !manifest.version) continue;
      const found = versions.get(manifest.name) || new Set();
      found.add(manifest.version);
      versions.set(manifest.name, found);
    }
  }
  return versions;
}

const versions = installedVersions();
let failed = false;
for (const requirement of minimums) {
  const installed = [...(versions.get(requirement.name) || [])].sort(compareVersions);
  const inScope = installed.filter((version) => Number(version.split(".")[0]) === requirement.major);
  if (inScope.length === 0) {
    if (requirement.optional) {
      console.log(`${requirement.name}: not present in this workspace dependency graph`);
      continue;
    }
    console.error(`${requirement.name}: no installed ${requirement.major}.x consumer resolution found`);
    failed = true;
    continue;
  }
  for (const version of inScope) {
    const valid = compareVersions(version, requirement.version) >= 0;
    console.log(`${requirement.name}@${version}${valid ? " OK" : ` BELOW ${requirement.version}`}`);
    if (!valid) failed = true;
  }
}

if (failed) process.exitCode = 1;