"""Formateador de códigos de formato de número de Excel con las convenciones de Colombia (es-CO).

Lo que se ve en la celda: miles con punto y decimales con coma ("1.234.567,89"), fechas y nombres de meses y días en
español, horas de 24 h salvo que el formato pida AM/PM ("a. m."/"p. m."). El formato corto de fecha del sistema
(Excel id 14 y 22) se muestra como dd/mm/aaaa.

Cubre: General; 0, 0.00, #,##0, #,##0.00 (cualquier nº de decimales), escalado por miles con comas finales, %;
científico 0.00E+00; fracciones # ?/?; secciones positivo;negativo;cero;texto con condiciones simples ([<0]);
colores ([Red], [Rojo]…, se ignoran); literales "…", \\x, _x (espacio), *x (relleno, se ignora), @; monedas
"$", [$€-2], [$US$-409], [$COP]; fechas y horas (yyyy yy m mm mmm mmmm mmmmm d dd ddd dddd h hh m/mm de minutos según
el contexto, s ss, .0, AM/PM, A/P) y tiempo transcurrido [h] [mm] [ss].
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction

MESES = [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
]
MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
DIAS_CORTOS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
SEP_MILES = "."
SEP_DECIMAL = ","
BASE_FECHAS = datetime(1899, 12, 30)
FECHA_CORTA = "dd/mm/yyyy"

# Formatos integrados que dependen de la configuración regional (openpyxl y xlrd los dan como texto en inglés)
_REGIONALES = {
    "mm-dd-yy": FECHA_CORTA,
    "m/d/yy": FECHA_CORTA,
    "m/d/yyyy": FECHA_CORTA,
    "m/d/yy h:mm": FECHA_CORTA + " h:mm",
    "m/d/yyyy h:mm": FECHA_CORTA + " h:mm",
    "mm-dd-yy h:mm": FECHA_CORTA + " h:mm",
}
_CONDICION = re.compile(r"\[(<=|>=|<>|<|>|=)\s*(-?\d+(?:\.\d+)?)\]")
_DIGITOS = "0#?"


def codigo_regional(codigo: str | None, id_formato: int | None = None) -> str:
    """El código que se aplica: los integrados de fecha corta (ids 14 y 22) pasan a dd/mm/aaaa."""
    if id_formato == 14:
        return FECHA_CORTA
    if id_formato == 22:
        return FECHA_CORTA + " h:mm"
    c = (codigo or "General").strip() or "General"
    return _REGIONALES.get(c.lower(), c)


# ------------------------------------------------------------------ tokens


@dataclass
class _Tok:
    tipo: str  # lit num punto coma pct exp barra fecha transc decseg ampm arroba general
    texto: str = ""


def _partir_secciones(codigo: str) -> list[str]:
    secciones: list[str] = []
    actual: list[str] = []
    i = 0
    while i < len(codigo):
        c = codigo[i]
        if c == '"':
            fin = codigo.find('"', i + 1)
            fin = len(codigo) - 1 if fin < 0 else fin
            actual.append(codigo[i : fin + 1])
            i = fin + 1
            continue
        if c in "\\_*" and i + 1 < len(codigo):
            actual.append(codigo[i : i + 2])
            i += 2
            continue
        if c == "[":
            fin = codigo.find("]", i)
            fin = len(codigo) - 1 if fin < 0 else fin
            actual.append(codigo[i : fin + 1])
            i = fin + 1
            continue
        if c == ";":
            secciones.append("".join(actual))
            actual = []
        else:
            actual.append(c)
        i += 1
    secciones.append("".join(actual))
    return secciones


def _tokens(seccion: str) -> list[_Tok]:
    toks: list[_Tok] = []
    i = 0
    n = len(seccion)
    while i < n:
        c = seccion[i]
        bajo = seccion[i:].lower()
        if c == '"':
            fin = seccion.find('"', i + 1)
            fin = n if fin < 0 else fin
            toks.append(_Tok("lit", seccion[i + 1 : fin]))
            i = fin + 1
        elif c == "\\" and i + 1 < n:
            toks.append(_Tok("lit", seccion[i + 1]))
            i += 2
        elif c == "_" and i + 1 < n:
            toks.append(_Tok("lit", " "))
            i += 2
        elif c == "*" and i + 1 < n:
            i += 2
        elif c == "[":
            fin = seccion.find("]", i)
            fin = n if fin < 0 else fin
            dentro = seccion[i + 1 : fin]
            d = dentro.lower()
            if d and d[0] in "hms" and set(d) == {d[0]}:
                toks.append(_Tok("transc", d))
            elif dentro.startswith("$"):
                simbolo = dentro[1:].split("-")[0]
                if simbolo:
                    toks.append(_Tok("lit", simbolo))
            i = fin + 1  # colores, condiciones, [DBNum1]…: se ignoran aquí
        elif bajo.startswith("general"):
            toks.append(_Tok("general"))
            i += 7
        elif bajo.startswith("am/pm"):
            toks.append(_Tok("ampm", "AM/PM"))
            i += 5
        elif bajo.startswith("a/p"):
            toks.append(_Tok("ampm", "A/P"))
            i += 3
        elif c in "Ee" and i + 1 < n and seccion[i + 1] in "+-":
            toks.append(_Tok("exp", seccion[i + 1]))
            i += 2
        elif c.lower() in "ymdhs":
            j = i
            while j < n and seccion[j].lower() == c.lower():
                j += 1
            toks.append(_Tok("fecha", seccion[i:j].lower()))
            i = j
        elif c in _DIGITOS:
            toks.append(_Tok("num", c))
            i += 1
        elif c == ".":
            previo = next((t for t in reversed(toks) if t.tipo in ("fecha", "transc")), None)
            j = i + 1
            while j < n and seccion[j] == "0":
                j += 1
            if previo is not None and previo.texto[0] == "s" and j > i + 1 and toks and toks[-1] is previo:
                toks.append(_Tok("decseg", "0" * (j - i - 1)))
                i = j
            else:
                toks.append(_Tok("punto"))
                i += 1
        elif c == ",":
            toks.append(_Tok("coma"))
            i += 1
        elif c == "%":
            toks.append(_Tok("pct"))
            i += 1
        elif c == "/":
            toks.append(_Tok("barra"))
            i += 1
        elif c == "@":
            toks.append(_Tok("arroba"))
            i += 1
        else:
            toks.append(_Tok("lit", c))
            i += 1
    return toks


def es_codigo_de_fecha(codigo: str | None) -> bool:
    """¿El código (su primera sección) muestra una fecha u hora?"""
    if not codigo:
        return False
    seccion = _partir_secciones(codigo_regional(codigo))[0]
    return any(t.tipo in ("fecha", "transc", "ampm") for t in _tokens(seccion))


# ------------------------------------------------------------------ API


def a_serial(valor: datetime | date | time | timedelta) -> float:
    """Fecha/hora de Python → número de serie de Excel (sistema 1900)."""
    if isinstance(valor, timedelta):
        return valor.total_seconds() / 86400
    if isinstance(valor, datetime):
        return (valor.replace(tzinfo=None) - BASE_FECHAS).total_seconds() / 86400
    if isinstance(valor, date):
        return float((valor - BASE_FECHAS.date()).days)
    return (valor.hour * 3600 + valor.minute * 60 + valor.second + valor.microsecond / 1e6) / 86400


def formatear(valor: object, codigo: str | None = "General") -> tuple[str, str]:
    """(texto como lo mostraría Excel en es-CO, tipo "t"|"n"|"f"|"b"|"e")."""
    cod = codigo_regional(codigo)
    if isinstance(valor, bool):
        return ("VERDADERO" if valor else "FALSO"), "b"
    if isinstance(valor, (datetime, date, time, timedelta)):
        serial = a_serial(valor)
        if not es_codigo_de_fecha(cod):
            con_hora = isinstance(valor, (datetime, time, timedelta)) and abs(serial - math.floor(serial)) > 1e-9
            if isinstance(valor, time):
                cod = "h:mm:ss"
            elif isinstance(valor, timedelta):
                cod = "[h]:mm:ss"
            else:
                cod = FECHA_CORTA + (" h:mm" if con_hora else "")
        return formatear_numero(serial, cod), "f"
    if isinstance(valor, (int, float)):
        if isinstance(valor, float) and (math.isnan(valor) or math.isinf(valor)):
            return "#NUM!", "e"
        return formatear_numero(float(valor), cod), ("f" if es_codigo_de_fecha(cod) else "n")
    texto = "" if valor is None else str(valor)
    return formatear_texto(texto, cod), "t"


def formatear_texto(texto: str, codigo: str) -> str:
    secciones = _partir_secciones(codigo)
    seccion = secciones[3] if len(secciones) >= 4 else secciones[0] if "@" in secciones[0] else None
    if seccion is None:
        return texto
    salida = []
    for t in _tokens(seccion):
        if t.tipo == "arroba":
            salida.append(texto)
        elif t.tipo == "lit":
            salida.append(t.texto)
    return "".join(salida)


def _cumple(cond: tuple[str, float], v: float) -> bool:
    op, n = cond
    return {
        "<": v < n,
        ">": v > n,
        "=": v == n,
        "<=": v <= n,
        ">=": v >= n,
        "<>": v != n,
    }[op]


def _elegir_seccion(secciones: list[str], v: float) -> tuple[str, bool]:
    """(sección, usar_valor_absoluto)."""
    conds = []
    for s in secciones:
        m = _CONDICION.search(s)
        conds.append((m.group(1), float(m.group(2))) if m else None)
    if any(conds[:2]):
        for i, (s, c) in enumerate(zip(secciones[:2], conds[:2], strict=False)):
            if c is not None and _cumple(c, v):
                return s, i > 0 and v < 0
        if len(secciones) >= 3:
            return secciones[2], v < 0
        return secciones[-1], False
    numericas = secciones[:3]
    if len(numericas) == 1:
        return numericas[0], False
    if v < 0:
        return numericas[1], True
    if v == 0 and len(numericas) >= 3:
        return numericas[2], False
    return numericas[0], False


def formatear_numero(v: float, codigo: str) -> str:
    secciones = _partir_secciones(codigo)
    seccion, absoluto = _elegir_seccion(secciones, v)
    toks = _tokens(seccion)
    if not toks:
        return ""
    if absoluto:
        v = abs(v)
    if any(t.tipo in ("fecha", "transc", "ampm") for t in toks):
        if v < 0 or v > 2958465.99999:  # Excel muestra ####### fuera de rango
            return general(v)
        return _fecha(v, toks)
    if any(t.tipo == "general" for t in toks):
        partes = []
        for t in toks:
            if t.tipo == "general":
                partes.append(general(v))
            elif t.tipo == "lit":
                partes.append(t.texto)
        return "".join(partes)
    if not any(t.tipo == "num" for t in toks):
        return "".join(t.texto for t in toks if t.tipo == "lit") or general(v)
    return _numero(v, toks)


def general(v: float) -> str:
    if v == int(v) and abs(v) < 1e11:
        return str(int(v))
    s = f"{v:.10g}"
    if "e" in s:
        mant, exp = s.split("e")
        if "." in mant:
            mant = mant.rstrip("0").rstrip(".")
        e = int(exp)
        return mant.replace(".", SEP_DECIMAL) + "E" + ("+" if e >= 0 else "-") + f"{abs(e):02d}"
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return s.replace(".", SEP_DECIMAL)


# ------------------------------------------------------------------ números


def _agrupar(entero: str) -> str:
    grupos: list[str] = []
    while len(entero) > 3:
        grupos.insert(0, entero[-3:])
        entero = entero[:-3]
    grupos.insert(0, entero)
    return SEP_MILES.join(grupos)


def _fijo(x: float, dec_max: int, dec_min: int, ent_min: int, miles: bool) -> str:
    d = Decimal(repr(abs(x))).quantize(Decimal(1).scaleb(-dec_max), rounding=ROUND_HALF_UP)
    texto = f"{d:f}"
    entero, _, decimales = texto.partition(".")
    entero = entero.lstrip("0")
    if len(entero) < ent_min:
        entero = entero.rjust(ent_min, "0")
    if miles and entero:
        entero = _agrupar(entero)
    decimales = decimales[:dec_max]
    while len(decimales) > dec_min and decimales.endswith("0"):
        decimales = decimales[:-1]
    return entero + (SEP_DECIMAL + decimales if decimales else "")


def _numero(v: float, toks: list[_Tok]) -> str:
    negativo = v < 0
    x = abs(v)
    idx_num = [i for i, t in enumerate(toks) if t.tipo in ("num", "punto", "exp", "barra")]
    primero, ultimo = idx_num[0], idx_num[-1]
    # dígitos del exponente o del denominador: lo que sigue tras exp/barra hasta el último número
    while ultimo + 1 < len(toks) and (
        toks[ultimo + 1].tipo == "num"
        or (toks[ultimo + 1].tipo == "coma" and ultimo + 2 < len(toks) and toks[ultimo + 2].tipo == "num")
    ):
        ultimo += 1
    # denominador fijo (# ?/8)
    barra = next((i for i in range(primero, ultimo + 1) if toks[i].tipo == "barra"), None)
    if barra is not None:
        k = ultimo + 1
        while k < len(toks) and toks[k].tipo == "lit" and toks[k].texto.isdigit():
            k += 1
        ultimo = k - 1
    prefijo = "".join(t.texto for t in toks[:primero] if t.tipo == "lit")
    sufijo_toks = toks[ultimo + 1 :]
    region = toks[primero : ultimo + 1]
    pct = sum(1 for t in toks if t.tipo == "pct")
    x *= 100**pct

    if barra is not None:
        cuerpo = _fraccion(x, region, barra - primero)
    else:
        exp = next((i for i, t in enumerate(region) if t.tipo == "exp"), None)
        mant = region if exp is None else region[:exp]
        punto = next((i for i, t in enumerate(mant) if t.tipo == "punto"), None)
        ent = mant if punto is None else mant[:punto]
        dec = [] if punto is None else [t for t in mant[punto + 1 :] if t.tipo == "num"]
        ent_nums = [i for i, t in enumerate(ent) if t.tipo == "num"]
        miles = any(t.tipo == "coma" for t in ent[: ent_nums[-1]]) if ent_nums else False
        escala = 0
        if ent_nums:
            for t in ent[ent_nums[-1] + 1 :]:
                if t.tipo == "coma":
                    escala += 1
        escala += sum(1 for t in sufijo_toks if t.tipo == "coma")
        x /= 1000**escala
        ent_min = sum(1 for i in ent_nums if ent[i].texto == "0")
        dec_max = len(dec)
        dec_min = sum(1 for t in dec if t.texto == "0")
        if exp is None:
            cuerpo = _fijo(x, dec_max, dec_min, ent_min, miles)  # "#" con 0 da "" (como Excel)
        else:
            signo = region[exp].texto
            dig_exp = sum(1 for t in region[exp + 1 :] if t.tipo == "num")
            cuerpo = _cientifico(x, dec_max, dec_min, max(1, ent_min), signo, dig_exp)
    sufijo = "".join(t.texto if t.tipo == "lit" else "%" if t.tipo == "pct" else "" for t in sufijo_toks)
    # un % dentro de la región o antes del número también se muestra en su sitio aproximado (al final)
    if pct and not any(t.tipo == "pct" for t in sufijo_toks):
        prefijo += "".join("%" for t in toks[:primero] if t.tipo == "pct")
    texto = prefijo + cuerpo + sufijo
    if negativo and any(c in "123456789" for c in cuerpo):
        texto = "-" + texto
    return texto


def _cientifico(x: float, dec_max: int, dec_min: int, ent: int, signo: str, dig_exp: int) -> str:
    if x == 0:
        e = 0
        mant = 0.0
    else:
        e = math.floor(math.log10(x)) - (ent - 1)
        mant = x / 10**e
        redondeada = float(Decimal(repr(mant)).quantize(Decimal(1).scaleb(-dec_max), rounding=ROUND_HALF_UP))
        if redondeada >= 10**ent:
            e += 1
            mant = x / 10**e
    marca = "+" if signo == "+" and e >= 0 else ("-" if e < 0 else "")
    return _fijo(mant, dec_max, dec_min, ent, False) + "E" + marca + str(abs(e)).rjust(max(1, dig_exp), "0")


def _fraccion(x: float, region: list[_Tok], barra: int) -> str:
    izq = region[:barra]
    der = region[barra + 1 :]
    fijo = "".join(t.texto for t in der if t.tipo == "lit" and t.texto.isdigit())
    n_den = sum(1 for t in der if t.tipo == "num")
    # parte entera: un grupo de dígitos separado del numerador por un literal
    grupos = 0
    en_grupo = False
    for t in izq:
        if t.tipo == "num":
            if not en_grupo:
                grupos += 1
            en_grupo = True
        else:
            en_grupo = False
    hay_entero = grupos >= 2
    entero = int(x) if hay_entero else 0
    resto = x - entero
    if fijo and int(fijo) > 0:  # denominador fijo: se conserva tal cual (1 4/8, no 1 1/2)
        den = int(fijo)
        num = round(resto * den)
        if num >= den:
            entero, num = entero + 1, 0
        if num == 0:
            return str(entero)
        return (
            f"{entero} {num}/{den}" if hay_entero and entero else f"{num + (0 if hay_entero else entero * den)}/{den}"
        )
    f = Fraction(resto).limit_denominator(max(1, 10 ** max(1, n_den) - 1))
    if f >= 1:
        entero += int(f)
        f -= int(f)
    if f == 0:
        return str(entero) if (hay_entero or entero) else "0"
    fr = f"{f.numerator}/{f.denominator}"
    return f"{entero} {fr}" if hay_entero and entero else fr


# ------------------------------------------------------------------ fechas


def _fecha(serial: float, toks: list[_Tok]) -> str:
    dec_seg = max((len(t.texto) for t in toks if t.tipo == "decseg"), default=0)
    unidad = 10**dec_seg
    total = round(serial * 86400 * unidad)  # en 1/unidad de segundo
    segundos_totales, fraccion = divmod(total, unidad)
    momento = BASE_FECHAS + timedelta(seconds=segundos_totales)
    ampm = any(t.tipo == "ampm" for t in toks)
    fechas = [i for i, t in enumerate(toks) if t.tipo in ("fecha", "transc")]
    salida: list[str] = []
    for i, t in enumerate(toks):
        if t.tipo == "lit":
            salida.append(t.texto)
        elif t.tipo in ("punto", "coma", "barra", "pct", "num"):
            salida.append({"punto": ".", "coma": ",", "barra": "/", "pct": "%"}.get(t.tipo, t.texto))
        elif t.tipo == "decseg":
            salida.append(SEP_DECIMAL + str(fraccion).rjust(dec_seg, "0")[: len(t.texto)])
        elif t.tipo == "ampm":
            manana = momento.hour < 12
            salida.append(("a. m." if manana else "p. m.") if t.texto == "AM/PM" else ("a" if manana else "p"))
        elif t.tipo == "transc":
            letra = t.texto[0]
            valor = segundos_totales // {"h": 3600, "m": 60, "s": 1}[letra]
            salida.append(str(valor).rjust(len(t.texto), "0"))
        elif t.tipo == "fecha":
            salida.append(_parte_fecha(t.texto, momento, ampm, _es_minuto(toks, fechas, i)))
    return "".join(salida)


def _es_minuto(toks: list[_Tok], fechas: list[int], i: int) -> bool:
    if toks[i].texto[0] != "m" or len(toks[i].texto) > 2:
        return False
    pos = fechas.index(i)
    previo = toks[fechas[pos - 1]] if pos > 0 else None
    siguiente = toks[fechas[pos + 1]] if pos + 1 < len(fechas) else None
    return (previo is not None and previo.texto[0] == "h") or (siguiente is not None and siguiente.texto[0] == "s")


def _parte_fecha(tok: str, m: datetime, ampm: bool, minuto: bool) -> str:
    letra, n = tok[0], len(tok)
    if letra == "y":
        return f"{m.year:04d}" if n >= 3 else f"{m.year % 100:02d}"
    if letra == "m" and minuto:
        return f"{m.minute:02d}" if n >= 2 else str(m.minute)
    if letra == "m":
        if n == 1:
            return str(m.month)
        if n == 2:
            return f"{m.month:02d}"
        if n == 3:
            return MESES_CORTOS[m.month - 1]
        if n == 5:
            return MESES[m.month - 1][0]
        return MESES[m.month - 1]
    if letra == "d":
        if n == 1:
            return str(m.day)
        if n == 2:
            return f"{m.day:02d}"
        if n == 3:
            return DIAS_CORTOS[m.weekday()]
        return DIAS[m.weekday()]
    if letra == "h":
        hora = (m.hour % 12 or 12) if ampm else m.hour
        return f"{hora:02d}" if n >= 2 else str(hora)
    return f"{m.second:02d}" if n >= 2 else str(m.second)
