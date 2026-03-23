#!/usr/bin/env bash
set -e

APPIMAGE="/home/likas/temp/t3code/release/T3-Code-0.0.13-x86_64.AppImage"
PROJECT_DIR="/home/likas/temp/t3code"

rm -f "$APPIMAGE"
cd "$PROJECT_DIR" && bun run dist:desktop:linux
exec "$APPIMAGE"
