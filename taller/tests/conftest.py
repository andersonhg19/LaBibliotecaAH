import shutil
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tests import corpus


@pytest.fixture(scope="session")
def dir_corpus(tmp_path_factory) -> Path:
    return tmp_path_factory.mktemp("corpus")


@pytest.fixture(scope="session")
def epub_prueba(dir_corpus):
    return corpus.crear_epub(dir_corpus / "prueba.epub")


@pytest.fixture(scope="session")
def pdf_prueba(dir_corpus):
    return corpus.crear_pdf_dos_columnas(dir_corpus / "prueba.pdf")


@pytest.fixture(scope="session")
def pdf_escaneado(dir_corpus):
    return corpus.crear_pdf_escaneado(dir_corpus / "escaneado.pdf")


@pytest.fixture(scope="session")
def docx_prueba(dir_corpus):
    return corpus.crear_docx(dir_corpus / "prueba.docx")


@pytest.fixture(scope="session")
def txt_prueba(dir_corpus):
    return corpus.crear_txt_latin1(dir_corpus / "prueba.txt")


@pytest.fixture
def datos(tmp_path) -> Path:
    d = tmp_path / "datos"
    d.mkdir()
    return d


hay_ffmpeg = pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="ffmpeg no está instalado")
hay_soffice = pytest.mark.skipif(
    shutil.which("soffice") is None and shutil.which("libreoffice") is None, reason="LibreOffice no está instalado"
)
