#!/bin/sh
# Regenera los requirements con hashes (pip-tools) dentro de un contenedor Python 3.12 Linux.
# Uso (en casa): docker run --rm -u 0 -v <repo>\traductor:/t -w /t --entrypoint sh <imagen python:3.12> requisitos/compilar.sh
set -e
python -m venv /tmp/pt
/tmp/pt/bin/pip install -q pip-tools==7.6.2
C="/tmp/pt/bin/pip-compile -q --generate-hashes --allow-unsafe --strip-extras --no-emit-index-url --resolver=backtracking"
$C -o requirements.txt requisitos/ejecucion.in
$C -o requirements-dev.txt requisitos/desarrollo.in
$C -o requisitos/convertir.txt --index-url https://download.pytorch.org/whl/cpu \
   --extra-index-url https://pypi.org/simple requisitos/convertir.in
echo "RESUMEN: requirements.txt, requirements-dev.txt y requisitos/convertir.txt regenerados"
