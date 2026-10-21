#!/usr/bin/env bash
# Genera el PDF del manual de usuario (public/docs/manual-usuario.pdf), que se abre desde la app.
# Requiere pandoc y wkhtmltopdf. Uso: bash scripts/generar_docs.sh
set -euo pipefail
cd "$(dirname "$0")/../docs"
pandoc MANUAL_USUARIO.md -s --metadata lang=es -c estilo-manual.css -o /tmp/manual-usuario.html
cp estilo-manual.css /tmp/ && rm -rf /tmp/img && cp -r img /tmp/img
wkhtmltopdf --quiet --enable-local-file-access --encoding utf-8 -s A4 -T 16 -B 16 -L 14 -R 14 \
  /tmp/manual-usuario.html ../public/docs/manual-usuario.pdf
echo "Listo: public/docs/manual-usuario.pdf"
