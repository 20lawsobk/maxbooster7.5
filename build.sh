#!/bin/bash
set -e
cd boosterstate
cargo build --release
cd ..
npm run build:deploy
