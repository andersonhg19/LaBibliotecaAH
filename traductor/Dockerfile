# Traductor de La Biblioteca AH: Opus-MT (Helsinki-NLP) en CTranslate2 int8, CPU, API de LibreTranslate.
# Etapas:
#   modelos       → descarga Opus-MT en revisión fija (sha256 verificado) y lo convierte a CTranslate2 int8.
#                   Aquí y solo aquí van transformers + torch CPU; nada de eso llega a la imagen final.
#   dependencias  → virtualenv de ejecución (ctranslate2, sentencepiece, fastapi, uvicorn) con hashes
#   sistema       → base común: usuario no root, TZ America/Bogota, venv + modelos
#   pruebas       → ruff + mypy + pytest con cobertura ≥ 85 %, incluida la de humo con el modelo real
#                   (docker build --target pruebas -t bah/traductor:pruebas . && docker run --rm bah/traductor:pruebas)
#   final         → imagen de ejecución (por defecto): arranca sin internet en segundos
ARG PYTHON_IMAGEN=python:3.12.16-slim-bookworm

# ---------- modelos ----------
FROM ${PYTHON_IMAGEN} AS modelos
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requisitos/convertir.txt /tmp/convertir.txt
RUN python -m venv /opt/conv \
 && /opt/conv/bin/pip install --require-hashes -r /tmp/convertir.txt \
      --index-url https://download.pytorch.org/whl/cpu --extra-index-url https://pypi.org/simple
COPY convertir/convertir.py /tmp/convertir.py
# La caché de BuildKit guarda las descargas (~600 MB) entre construcciones: si cambia solo este script,
# no se vuelven a bajar. Las sumas sha256 están fijadas en el script.
RUN --mount=type=cache,target=/descargas /opt/conv/bin/python /tmp/convertir.py /modelos /descargas

# ---------- dependencias ----------
FROM ${PYTHON_IMAGEN} AS dependencias
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
COPY requirements.txt /tmp/requirements.txt
RUN /opt/venv/bin/pip install --require-hashes -r /tmp/requirements.txt

# ---------- sistema ----------
FROM ${PYTHON_IMAGEN} AS sistema
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=America/Bogota \
    LANG=C.UTF-8 \
    TRADUCTOR_MODELOS=/modelos \
    TRADUCTOR_PUERTO=5000 \
    PATH=/opt/venv/bin:$PATH
RUN apt-get update \
 && apt-get install -y --no-install-recommends tzdata \
 && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
 && rm -rf /var/lib/apt/lists/* /usr/share/doc/* /usr/share/man/* \
 && groupadd --system --gid 10002 traductor \
 && useradd --system --uid 10002 --gid traductor --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin traductor
COPY --from=dependencias /opt/venv /opt/venv
COPY --from=modelos /modelos /modelos
WORKDIR /app

# ---------- pruebas: la misma puerta que en CI, más la prueba de humo con el modelo real ----------
FROM sistema AS pruebas
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt requirements-dev.txt ./
RUN pip install --require-hashes -r requirements-dev.txt
COPY pyproject.toml ./
COPY app ./app
COPY tests ./tests
RUN chown -R traductor:traductor /app
USER traductor
CMD ["sh", "-c", "ruff check . && ruff format --check . && mypy && python -m pytest -q -m 'modelo or not modelo'"]

# ---------- final ----------
FROM sistema AS final
COPY app ./app
USER traductor
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["python", "-c", "import os, urllib.request as u; u.urlopen('http://127.0.0.1:' + os.environ.get('TRADUCTOR_PUERTO', '5000') + '/health', timeout=4)"]
CMD ["python", "-m", "app"]
