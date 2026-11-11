"""Genera collection/La Biblioteca AH.postman_collection.json a partir de las specs
OpenAPI publicadas en documentación/api/ (las mantiene al dia LaSpecPublicadaEstaAlDiaTest).

Uso (desde la raiz del repo):  python backend/scripts/generar-postman.py
Una carpeta por servicio; variables {{gateway}} y {{token}} (vacio: nunca un token real).
"""
import json
import pathlib
import sys

RAIZ = pathlib.Path(__file__).resolve().parents[2]
API = RAIZ / "documentación" / "api"
SALIDA = RAIZ / "collection" / "La Biblioteca AH.postman_collection.json"
SERVICIOS = [("auth-service", "AUTH-SERVICE"), ("biblioteca-service", "BIBLIOTECA-SERVICE")]
CONTEXTO = "/biblioteca"


def resolver(spec, esquema):
    if "$ref" in esquema:
        nombre = esquema["$ref"].split("/")[-1]
        return spec["components"]["schemas"][nombre]
    return esquema


def ejemplo(spec, esquema, profundidad=0):
    esquema = resolver(spec, esquema)
    if "example" in esquema:
        return esquema["example"]
    if profundidad > 3:
        return None
    tipo = esquema.get("type")
    if tipo == "object" or "properties" in esquema:
        return {k: ejemplo(spec, v, profundidad + 1) for k, v in esquema.get("properties", {}).items()}
    if tipo == "array":
        return [ejemplo(spec, esquema.get("items", {}), profundidad + 1)]
    if "enum" in esquema:
        return esquema["enum"][0]
    if tipo == "string":
        return {"uuid": "00000000-0000-0000-0000-000000000000", "date-time": "2026-11-10T20:00:00Z"}.get(
            esquema.get("format"), "")
    if tipo in ("integer", "number"):
        return 0
    if tipo == "boolean":
        return False
    return None


def peticion(spec, prefijo, ruta, metodo, op):
    segmentos = [s for s in (prefijo + CONTEXTO + ruta).split("/") if s]
    url_cruda = "{{gateway}}/" + "/".join(segmentos).replace("{", ":").replace("}", "")
    req = {
        "method": metodo.upper(),
        "header": [],
        "url": {"raw": url_cruda, "host": ["{{gateway}}"],
                "path": [s.replace("{", ":").replace("}", "") for s in segmentos]},
        "description": op.get("description") or op.get("summary", ""),
    }
    variables = [p["name"] for p in op.get("parameters", []) if p.get("in") == "path"]
    if variables:
        req["url"]["variable"] = [{"key": v, "value": ""} for v in variables]
    cuerpo = op.get("requestBody", {}).get("content", {})
    if "application/json" in cuerpo:
        req["header"].append({"key": "Content-Type", "value": "application/json"})
        req["body"] = {"mode": "raw", "raw": json.dumps(ejemplo(spec, cuerpo["application/json"]["schema"]),
                                                        ensure_ascii=False, indent=2),
                       "options": {"raw": {"language": "json"}}}
    elif "multipart/form-data" in cuerpo:
        req["body"] = {"mode": "formdata", "formdata": [
            {"key": "archivos", "type": "file", "src": []},
            {"key": "tipo", "value": "LIBRO", "type": "text"}]}
    if "/archivos/" in ruta or "muestra.mp3" in ruta:
        req["url"]["query"] = [{"key": "t", "value": "{{token}}"}]
        req["url"]["raw"] += "?t={{token}}"
    if "/v1/auth/" in ruta:
        req["auth"] = {"type": "noauth"}
    binario = "/archivos/" in ruta or "muestra.mp3" in ruta
    ejemplo_resp = {
        "name": "OK",
        "originalRequest": req,
        "status": "OK" if not binario else "Partial Content",
        "code": 200 if not binario else 206,
        "_postman_previewlanguage": "json",
        "header": [{"key": "Content-Type", "value": "application/json"}],
        "body": json.dumps({"correct": True, "message": "OK", "errorCode": 0, "object": {}}, indent=2)
        if not binario else "(binario; con Range: bytes=0-99 responde 206 y Content-Range)",
    }
    return {"name": op.get("summary", metodo.upper() + " " + ruta), "request": req, "response": [ejemplo_resp]}


def main():
    carpetas = []
    for archivo, prefijo in SERVICIOS:
        fichero = API / f"{archivo}.json"
        if not fichero.exists():
            sys.exit(f"FALLA: no existe {fichero}; genera la spec con -Dactualizar.spec=true")
        spec = json.loads(fichero.read_text(encoding="utf-8"))
        items = []
        for ruta, metodos in sorted(spec["paths"].items()):
            for metodo, op in metodos.items():
                if metodo in ("get", "post", "head"):
                    if metodo == "head":
                        continue
                    items.append(peticion(spec, "/" + prefijo, ruta, metodo, op))
        carpetas.append({"name": archivo, "item": items})
    coleccion = {
        "info": {"name": "La Biblioteca AH",
                 "description": "Generada desde documentación/api con backend/scripts/generar-postman.py. "
                                "Pon {{token}} con el JWT de POST /v1/auth/login.",
                 "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"},
        "auth": {"type": "bearer", "bearer": [{"key": "token", "value": "{{token}}", "type": "string"}]},
        "variable": [{"key": "gateway", "value": "http://localhost:8920"}, {"key": "token", "value": ""}],
        "item": carpetas,
    }
    SALIDA.parent.mkdir(parents=True, exist_ok=True)
    SALIDA.write_text(json.dumps(coleccion, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    total = sum(len(c["item"]) for c in carpetas)
    print(f"RESUMEN: {total} peticiones en {SALIDA}")


if __name__ == "__main__":
    main()
