"""Descarga Opus-MT (Helsinki-NLP) en una revisión fija, verifica sha256 y lo convierte a CTranslate2 int8.

Solo corre en la etapa ``modelos`` del Dockerfile (con transformers + torch CPU). La imagen final
copia el resultado: ``/modelos/{origen}-{destino}/{model.bin, shared_vocabulary.json, source.spm, target.spm}``.

Uso: python convertir.py /modelos [/descargas]
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sys
import time
import urllib.request

# Revisión (commit) fija de cada repositorio y sha256 de cada archivo que se usa.
MODELOS = {
    "en-es": (
        "Helsinki-NLP/opus-mt-en-es",
        "5bc4493d463cf000c1f0b50f8d56886a392ed4ab",
        {
            "pytorch_model.bin": "befce0f620e8e63f83bbb7f0818eb51d541cba28057a7cc14b00466d85c4994c",
            "config.json": "666ad3c2943674b6a789e311d221e44ec23e27f1bd9727930754bf773ec8e464",
            "generation_config.json": "837839ed0534a27084f9b980fc33f47729052dd89cb26cca7ac830765ed30e49",
            "tokenizer_config.json": "9859e3f8f73e2f50ab3e5cc2de432645347432956df4772d33209a346dd97f3b",
            "vocab.json": "257f346d7a6b2ecceafcca8ba05648ce2fd68dfaf105fb0e913dca7198f3f6d5",
            "source.spm": "4dd547c24816a335e7b0b2e63376a8f1b3cbfc671eda5ab808dd44fdadaa8791",
            "target.spm": "e236ee6d866b635c0142114f8647f39831f9d92534aa2aad75c942f6a78ad0e3",
        },
    ),
    "es-en": (
        "Helsinki-NLP/opus-mt-es-en",
        "c96e2c5399ebfae4fc43d9669556b9afa74bb69d",
        {
            "pytorch_model.bin": "586a4e69e0804459ac7c176a5dc76852652100d9af1ee0db796de719899a5deb",
            "config.json": "374443eacf8986c21386503e2fcd52eae6952ac09c87fd36695f5c12259a4cd1",
            "generation_config.json": "837839ed0534a27084f9b980fc33f47729052dd89cb26cca7ac830765ed30e49",
            "tokenizer_config.json": "dd009536f1cd954180a3004be20e9963eaf3d68b485d062ea1b90d3b9ded2bc5",
            "vocab.json": "257f346d7a6b2ecceafcca8ba05648ce2fd68dfaf105fb0e913dca7198f3f6d5",
            "source.spm": "e236ee6d866b635c0142114f8647f39831f9d92534aa2aad75c942f6a78ad0e3",
            "target.spm": "4dd547c24816a335e7b0b2e63376a8f1b3cbfc671eda5ab808dd44fdadaa8791",
        },
    ),
}
INTENTOS = 8
BLOQUE = 1 << 20


def _sha256(ruta: str) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for trozo in iter(lambda: f.read(BLOQUE), b""):
            h.update(trozo)
    return h.hexdigest()


def _descargar(url: str, destino: str) -> None:
    """Descarga con reanudación (Range) y reintentos: la red de casa a veces se queda colgada."""
    for intento in range(1, INTENTOS + 1):
        hecho = os.path.getsize(destino) if os.path.exists(destino) else 0
        peticion = urllib.request.Request(url, headers={"User-Agent": "bah-traductor-build"})
        if hecho:
            peticion.add_header("Range", f"bytes={hecho}-")
        try:
            with urllib.request.urlopen(peticion, timeout=60) as r, open(destino, "ab" if hecho else "wb") as f:
                if hecho and r.status != 206:
                    f.seek(0)
                    f.truncate()
                shutil.copyfileobj(r, f, BLOQUE)
            return
        except OSError as e:
            print(f"  intento {intento}/{INTENTOS} fallido para {url}: {e}", flush=True)
            time.sleep(min(30, 2 * intento))
    raise SystemExit(f"FALLA: no se pudo descargar {url}")


def main() -> None:
    salida = sys.argv[1] if len(sys.argv) > 1 else "/modelos"
    descargas = sys.argv[2] if len(sys.argv) > 2 else "/tmp/descargas"
    from ctranslate2.converters import TransformersConverter

    resumen = {}
    for par, (repo, revision, archivos) in MODELOS.items():
        origen = os.path.join(descargas, par)
        os.makedirs(origen, exist_ok=True)
        for nombre, esperado in archivos.items():
            ruta = os.path.join(origen, nombre)
            if not (os.path.exists(ruta) and _sha256(ruta) == esperado):
                if os.path.exists(ruta):
                    os.remove(ruta)
                _descargar(f"https://huggingface.co/{repo}/resolve/{revision}/{nombre}", ruta)
            real = _sha256(ruta)
            if real != esperado:
                raise SystemExit(f"FALLA: sha256 de {par}/{nombre} = {real}, se esperaba {esperado}")
        destino = os.path.join(salida, par)
        shutil.rmtree(destino, ignore_errors=True)
        inicio = time.time()
        TransformersConverter(origen, copy_files=["source.spm", "target.spm"]).convert(destino, quantization="int8")
        resumen[par] = {"repo": repo, "revision": revision, "segundos": round(time.time() - inicio)}
        print(f"{par}: convertido en {resumen[par]['segundos']} s -> {sorted(os.listdir(destino))}", flush=True)
    with open(os.path.join(salida, "modelos.json"), "w", encoding="utf-8") as f:
        json.dump(resumen, f, indent=1)


if __name__ == "__main__":
    main()
