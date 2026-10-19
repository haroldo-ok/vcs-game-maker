#!/bin/sh
# Starts VCS Game Maker from the folder it was unpacked into: nothing is installed and no root access is needed.
# The sandbox is turned off because the sandbox helper only works once it is installed as root (a setuid file), which an
# unpacked folder cannot be, and many systems (the Atari VCS among them) do not allow the sandbox without it.
HERE=$(dirname "$(readlink -f "$0")")
missing=$(ldd "$HERE/vcs-game-maker" 2>/dev/null | grep "not found")
if [ -n "$missing" ]; then
  echo "VCS Game Maker needs these system libraries, which are not installed:" >&2
  echo "$missing" >&2
fi
exec "$HERE/vcs-game-maker" --no-sandbox "$@"
