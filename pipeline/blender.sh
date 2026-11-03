#!/usr/bin/env bash
# Executa o Blender portátil instalado em pipeline/blender/ (ignorado pelo git).
# lib-extra/ contém libSM/libICE, ausentes no Ubuntu do WSL, para não exigir sudo apt.
# Uso: pipeline/blender.sh -b pipeline/source/<arquivo>.blend -P pipeline/export_systems.py [-- --list]
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/blender"
if [[ ! -x "$DIR/blender" ]]; then
  echo "Blender não encontrado em $DIR (ver seção 'Pipeline de modelos' do CLAUDE.md)." >&2
  exit 1
fi
export LD_LIBRARY_PATH="$DIR/lib-extra${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$DIR/blender" "$@"
