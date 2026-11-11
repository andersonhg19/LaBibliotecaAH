# Taller de La Biblioteca AH: conversión de documentos + generación de voz.
# Etapas:
#   sistema       → Debian + ffmpeg, pandoc, LibreOffice Writer (sin GUI), fuentes, TZ America/Bogota
#   dependencias  → virtualenv con las dependencias Python (sin caché de pip en la imagen final)
#   pruebas       → ruff + mypy + pytest con cobertura ≥ 85 %   (docker build --target pruebas .)
#   final         → imagen de ejecución, usuario no root, HEALTHCHECK (por defecto)
ARG PYTHON_IMAGEN=python:3.12.16-slim-bookworm

FROM ${PYTHON_IMAGEN} AS dependencias
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
COPY requirements.txt /tmp/requirements.txt
RUN pip install -r /tmp/requirements.txt

FROM ${PYTHON_IMAGEN} AS sistema
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=America/Bogota \
    LANG=C.UTF-8 \
    HOME=/home/taller \
    TALLER_DATOS=/datos \
    TALLER_PUERTO=8926 \
    PATH=/opt/venv/bin:$PATH
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg pandoc libreoffice-writer-nogui fonts-dejavu-core tzdata curl \
 && ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
 && rm -rf /var/lib/apt/lists/* /usr/share/doc/* /usr/share/man/*
RUN groupadd --system --gid 10001 taller \
 && useradd --system --uid 10001 --gid taller --create-home --home-dir /home/taller taller \
 && mkdir -p /datos && chown taller:taller /datos
COPY --from=dependencias /opt/venv /opt/venv
WORKDIR /app

# ---------- pruebas: la misma puerta que en CI ----------
FROM sistema AS pruebas
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1
COPY requirements.txt requirements-dev.txt ./
RUN pip install -r requirements-dev.txt
COPY pyproject.toml ./
COPY app ./app
COPY tests ./tests
RUN chown -R taller:taller /app
USER taller
CMD ["sh", "-c", "ruff check . && ruff format --check . && mypy && python -m pytest -q"]

# ---------- final ----------
FROM sistema AS final
COPY app ./app
USER taller
EXPOSE 8926
VOLUME ["/datos"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8926/salud || exit 1
CMD ["python", "-m", "app"]
