#!/usr/bin/env bash

_resolve_media_binary() {
  local requested="$1"
  local name="$2"
  local candidate=""

  if [ -n "$requested" ]; then
    case "$requested" in
      */*) candidate="$requested" ;;
      *) candidate="$(command -v -- "$requested" 2>/dev/null || true)" ;;
    esac
  else
    candidate="$(command -v -- "$name" 2>/dev/null || true)"
  fi

  if [ -z "$candidate" ] && [ -z "$requested" ] && [ "$name" = "ffmpeg" ]; then
    local nix_candidate
    for nix_candidate in /nix/store/*-ffmpeg-full-*-bin/bin/ffmpeg /nix/store/*-ffmpeg-*-bin/bin/ffmpeg; do
      if "$nix_candidate" -version >/dev/null 2>&1; then
        candidate="$nix_candidate"
        break
      fi
    done
  fi

  if [ -z "$candidate" ] || ! "$candidate" -version >/dev/null 2>&1; then
    echo "[ffmpeg] FATAL: $name is unavailable or not executable${requested:+ at $requested}" >&2
    return 1
  fi

  printf '%s\n' "$candidate"
}

resolve_ffmpeg() {
  local ffmpeg_candidate
  local ffprobe_candidate

  ffmpeg_candidate="$(_resolve_media_binary "${FFMPEG_BIN:-${FFMPEG_PATH:-}}" ffmpeg)" || return 1
  if [ -n "${FFPROBE_PATH:-}" ]; then
    ffprobe_candidate="$(_resolve_media_binary "$FFPROBE_PATH" ffprobe)" || return 1
  else
    ffprobe_candidate="$(_resolve_media_binary "" ffprobe)" || {
      ffprobe_candidate="$(_resolve_media_binary "$(dirname "$ffmpeg_candidate")/ffprobe" ffprobe)" || return 1
    }
  fi

  export FFMPEG_BIN="$ffmpeg_candidate"
  export FFMPEG_PATH="$ffmpeg_candidate"
  export FFPROBE_PATH="$ffprobe_candidate"
}

verify_ffmpeg_capabilities() {
  local filters
  local encoders
  local required

  filters="$("$FFMPEG_BIN" -hide_banner -filters 2>/dev/null)" || {
    echo "[ffmpeg] FATAL: cannot list FFmpeg filters" >&2
    return 1
  }
  for required in rubberband loudnorm aresample; do
    if [[ "$filters" != *"$required"* ]]; then
      echo "[ffmpeg] FATAL: required filter '$required' is unavailable" >&2
      return 1
    fi
  done

  encoders="$("$FFMPEG_BIN" -hide_banner -encoders 2>/dev/null)" || {
    echo "[ffmpeg] FATAL: cannot list FFmpeg encoders" >&2
    return 1
  }
  for required in libx264 libmp3lame libopus aac; do
    if [[ "$encoders" != *"$required"* ]]; then
      echo "[ffmpeg] FATAL: required encoder '$required' is unavailable" >&2
      return 1
    fi
  done

  echo "[ffmpeg] required media filters and encoders verified"
}
