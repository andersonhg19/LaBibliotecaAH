"""Verificaciones comunes de la salida de una conversión."""

import json
import re
import zipfile
from pathlib import Path

from lxml import etree

NS_OPF = {"opf": "http://www.idpf.org/2007/opf", "c": "urn:oasis:names:tc:opendocument:xmlns:container"}
XHTML = "{http://www.w3.org/1999/xhtml}"
ID_FRASE = re.compile(r"^c(\d{3})-s(\d{5})$")


def validar_salida(dir_norm: Path) -> dict:
    """Valida libro.epub, estructura.json y frases/*.json y su coherencia. Devuelve la estructura."""
    est = json.loads((dir_norm / "estructura.json").read_text(encoding="utf-8"))
    for k in (
        "versionFormato",
        "versionTexto",
        "titulo",
        "autores",
        "idioma",
        "isbn",
        "editorial",
        "anio",
        "sinopsis",
        "materias",
        "tienePortada",
        "capitulos",
        "toc",
        "totalFrases",
        "totalPalabras",
        "minutosEstimados",
    ):
        assert k in est, f"falta {k} en estructura.json"
    assert est["versionFormato"] == 1 and est["versionTexto"] == 1
    assert isinstance(est["autores"], list)
    assert est["tienePortada"] == (dir_norm / "portada.jpg").exists()
    assert est["minutosEstimados"] == -(-est["totalPalabras"] // 150)

    ruta_epub = dir_norm / "libro.epub"
    with zipfile.ZipFile(ruta_epub) as z:
        infos = z.infolist()
        assert infos[0].filename == "mimetype"
        assert infos[0].compress_type == zipfile.ZIP_STORED
        assert z.read("mimetype") == b"application/epub+zip"
        assert infos[0].extra == b""
        cont = etree.fromstring(z.read("META-INF/container.xml"))
        ruta_opf = cont.find(".//c:rootfile", NS_OPF).get("full-path")
        opf = etree.fromstring(z.read(ruta_opf))
        assert opf.get("version") == "3.0"
        base = ruta_opf.rsplit("/", 1)[0] + "/"
        nombres = set(z.namelist())
        manifiesto = {}
        for item in opf.iterfind(".//opf:manifest/opf:item", NS_OPF):
            assert base + item.get("href") in nombres, f"falta {item.get('href')} en el zip"
            manifiesto[item.get("id")] = item
        assert any("nav" in (i.get("properties") or "") for i in manifiesto.values())
        spine = [r.get("idref") for r in opf.iterfind(".//opf:spine/opf:itemref", NS_OPF)]
        assert len(spine) == len(est["capitulos"])
        for idref, cap in zip(spine, est["capitulos"], strict=True):
            assert manifiesto[idref].get("href") == cap["href"]
        etree.fromstring(z.read(base + "nav.xhtml"))
        etree.fromstring(z.read(base + "toc.ncx"))

        total = 0
        for cap in est["capitulos"]:
            i = cap["indice"]
            xhtml = etree.fromstring(z.read(base + cap["href"]))  # debe ser XML bien formado
            spans = [s for s in xhtml.iter(XHTML + "span") if s.get("class") == "bah-f"]
            frases = json.loads((dir_norm / "frases" / f"cap-{i:03d}.json").read_text(encoding="utf-8"))
            assert frases["capitulo"] == i
            assert len(spans) == len(frases["frases"]) == cap["frases"]
            for n, (span, fr) in enumerate(zip(spans, frases["frases"], strict=True)):
                m = ID_FRASE.match(span.get("id"))
                assert m and int(m.group(1)) == i and int(m.group(2)) == n, span.get("id")
                assert fr["id"] == span.get("id")
                assert "".join(span.itertext()) == fr["texto"], (fr["texto"], "".join(span.itertext()))
                assert span.find(".//" + XHTML + "span[@class='bah-f']") is None  # sin anidar
            if spans:
                assert cap["primeraFrase"] == spans[0].get("id")
                assert cap["ultimaFrase"] == spans[-1].get("id")
            total += len(spans)
            # ids únicos en el documento
            ids = [e.get("id") for e in xhtml.iter() if e.get("id")]
            assert len(ids) == len(set(ids))
        assert total == est["totalFrases"]
    return est


def textos(dir_norm: Path) -> list[str]:
    salida = []
    for f in sorted((dir_norm / "frases").glob("cap-*.json")):
        salida.extend(x["texto"] for x in json.loads(f.read_text(encoding="utf-8"))["frases"])
    return salida


def frases_cap(dir_norm: Path, i: int) -> list[dict]:
    return json.loads((dir_norm / "frases" / f"cap-{i:03d}.json").read_text(encoding="utf-8"))["frases"]
