#!/usr/bin/env python3
"""
Gera o PDF do sermão a partir da transcrição gravada durante o culto.

Entrada: logs/transcricao-{slug}-AAAAMMDD.log (uma linha por trecho, como chega do
data channel: "HH:MM:SS [lang] pedaço de texto"). Os trechos são fragmentos — o Gemini
manda a legenda em pedaços curtos —, então aqui eles são costurados em parágrafos.

Saída: um PDF por idioma, texto de verdade (não imagem), multipágina, sem dependência
externa — o PDF é escrito à mão com as fontes base do formato (Helvetica/Times), como
no gerador de QR e do cartaz.

Uso:
    python sermao-pdf.py transcricao.log --igreja "Redeem Community Church" \
        --data 2026-08-30 --saida ./pdfs
"""
import argparse
import re
import unicodedata
from datetime import date
from pathlib import Path

# ── Página (A4 em pontos) ───────────────────────────────────────────────────
LARGURA, ALTURA = 595.28, 841.89
MARGEM_X, MARGEM_TOPO, MARGEM_BASE = 56.0, 72.0, 56.0
CORPO_TAM, CORPO_ALT = 11.0, 16.0        # tamanho e entrelinha do texto
TITULO_TAM = 20.0

IDIOMA_NOME = {
    'pt-BR': 'Português', 'es': 'Español', 'en': 'English', 'fr': 'Français',
    'de': 'Deutsch', 'it': 'Italiano', 'ht': 'Kreyòl ayisyen',
}
RODAPE = {
    'pt-BR': 'Transcrição automática da tradução ao vivo — pode conter imprecisões.',
    'es': 'Transcripción automática de la traducción en vivo — puede contener imprecisiones.',
    'en': 'Automatic transcript of the live translation — may contain inaccuracies.',
}
CABECALHO_DATA = {'pt-BR': 'Culto de', 'es': 'Culto del', 'en': 'Service of'}

# Larguras da Helvetica (em 1/1000 de em) para quebrar linha de verdade.
# Só o essencial: ASCII imprimível; o resto usa a largura média.
_W = {
    ' ': 278, '!': 278, '"': 355, '#': 556, '$': 556, '%': 889, '&': 667, "'": 191,
    '(': 333, ')': 333, '*': 389, '+': 584, ',': 278, '-': 333, '.': 278, '/': 278,
    '0': 556, '1': 556, '2': 556, '3': 556, '4': 556, '5': 556, '6': 556, '7': 556,
    '8': 556, '9': 556, ':': 278, ';': 278, '<': 584, '=': 584, '>': 584, '?': 556,
    '@': 1015, 'A': 667, 'B': 667, 'C': 722, 'D': 722, 'E': 667, 'F': 611, 'G': 778,
    'H': 722, 'I': 278, 'J': 500, 'K': 667, 'L': 556, 'M': 833, 'N': 722, 'O': 778,
    'P': 667, 'Q': 778, 'R': 722, 'S': 667, 'T': 611, 'U': 722, 'V': 667, 'W': 944,
    'X': 667, 'Y': 667, 'Z': 611, '[': 278, '\\': 278, ']': 278, '^': 469, '_': 556,
    '`': 333, 'a': 556, 'b': 556, 'c': 500, 'd': 556, 'e': 556, 'f': 278, 'g': 556,
    'h': 556, 'i': 222, 'j': 222, 'k': 500, 'l': 222, 'm': 833, 'n': 556, 'o': 556,
    'p': 556, 'q': 556, 'r': 333, 's': 500, 't': 278, 'u': 556, 'v': 500, 'w': 722,
    'x': 500, 'y': 500, 'z': 500, '{': 334, '|': 260, '}': 334, '~': 584,
}


def largura(texto: str, tamanho: float) -> float:
    total = 0
    for ch in texto:
        base = _W.get(ch)
        if base is None:                       # acentuado: usa a largura da letra sem acento
            sem = unicodedata.normalize('NFD', ch)[0]
            base = _W.get(sem, 556)
        total += base
    return total * tamanho / 1000.0


def ler_transcricao(caminho: Path) -> dict[str, list[str]]:
    """Agrupa os trechos por idioma, na ordem em que chegaram."""
    por_idioma: dict[str, list[str]] = {}
    linha_re = re.compile(r'^\d{2}:\d{2}:\d{2} \[([^\]]+)\] (.*)$')
    for linha in caminho.read_text(encoding='utf-8', errors='replace').splitlines():
        m = linha_re.match(linha)
        if not m:
            continue
        lang, texto = m.group(1), m.group(2)
        if texto.startswith('LOUVOR') or texto.startswith('---'):
            continue                            # letra de música não entra no sermão
        por_idioma.setdefault(lang, []).append(texto)
    return por_idioma


def montar_paragrafos(trechos: list[str]) -> list[str]:
    """Costura os fragmentos em parágrafos: junta tudo e quebra em fim de frase."""
    texto = ''.join(t if t.startswith(' ') else ' ' + t for t in trechos)
    texto = re.sub(r'\s+', ' ', texto).strip()
    paragrafos, atual = [], ''
    for frase in re.findall(r'[^.!?…]+[.!?…]*', texto):
        atual += frase
        if len(atual) > 420 and re.search(r'[.!?…]\s*$', atual):
            paragrafos.append(atual.strip())
            atual = ''
    if atual.strip():
        paragrafos.append(atual.strip())
    return paragrafos


def quebrar(texto: str, tamanho: float, largura_util: float) -> list[str]:
    linhas, atual = [], ''
    for palavra in texto.split(' '):
        teste = (atual + ' ' + palavra).strip()
        if largura(teste, tamanho) > largura_util and atual:
            linhas.append(atual)
            atual = palavra
        else:
            atual = teste
    if atual:
        linhas.append(atual)
    return linhas


def esc(texto: str) -> bytes:
    """Texto → bytes WinAnsi com escapes de PDF."""
    saida = texto.replace('\\', r'\\').replace('(', r'\(').replace(')', r'\)')
    return saida.encode('cp1252', errors='replace')


def gerar_pdf(paragrafos: list[str], igreja: str, quando: str, lang: str, destino: Path) -> Path:
    largura_util = LARGURA - 2 * MARGEM_X
    titulo = igreja
    subtitulo = f"{CABECALHO_DATA.get(lang, 'Service of')} {quando} · {IDIOMA_NOME.get(lang, lang)}"
    rodape = RODAPE.get(lang, RODAPE['en'])

    paginas: list[list[tuple[float, float, str, float]]] = []   # (x, y, texto, tamanho)
    atual: list[tuple[float, float, str, float]] = []
    y = ALTURA - MARGEM_TOPO

    atual.append((MARGEM_X, y, titulo, TITULO_TAM))
    y -= TITULO_TAM + 8
    atual.append((MARGEM_X, y, subtitulo, 10.5))
    y -= 28

    for par in paragrafos:
        for linha in quebrar(par, CORPO_TAM, largura_util):
            if y < MARGEM_BASE + CORPO_ALT:
                paginas.append(atual)
                atual, y = [], ALTURA - MARGEM_TOPO
            atual.append((MARGEM_X, y, linha, CORPO_TAM))
            y -= CORPO_ALT
        y -= CORPO_ALT * 0.55                      # respiro entre parágrafos
    paginas.append(atual)

    objetos: list[bytes] = []

    def add(corpo: bytes) -> int:
        objetos.append(corpo)
        return len(objetos)

    fonte_normal = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>')
    fonte_bold = add(b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>')

    conteudos, paginas_ids = [], []
    for i, pagina in enumerate(paginas):
        partes = [b'BT\n']
        for x, yy, texto, tam in pagina:
            fonte = b'/F2' if tam >= TITULO_TAM else b'/F1'
            partes.append(b'%s %.1f Tf\n1 0 0 1 %.1f %.1f Tm\n(%s) Tj\n' % (fonte, tam, x, yy, esc(texto)))
        # rodapé com número de página
        partes.append(b'/F1 8.5 Tf\n1 0 0 1 %.1f %.1f Tm\n(%s) Tj\n'
                      % (MARGEM_X, MARGEM_BASE - 22, esc(f'{rodape}   ·   {i + 1}/{len(paginas)}')))
        partes.append(b'ET')
        fluxo = b''.join(partes)
        conteudos.append(add(b'<< /Length %d >>\nstream\n%s\nendstream' % (len(fluxo), fluxo)))
        paginas_ids.append(None)

    pages_id = len(objetos) + len(paginas) + 1
    for i, cid in enumerate(conteudos):
        paginas_ids[i] = add(
            b'<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %.2f %.2f] '
            b'/Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> /Contents %d 0 R >>'
            % (pages_id, LARGURA, ALTURA, fonte_normal, fonte_bold, cid)
        )
    kids = b' '.join(b'%d 0 R' % pid for pid in paginas_ids)
    pages = add(b'<< /Type /Pages /Kids [%s] /Count %d >>' % (kids, len(paginas_ids)))
    assert pages == pages_id, (pages, pages_id)
    catalogo = add(b'<< /Type /Catalog /Pages %d 0 R >>' % pages)

    saida, offsets = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n'), []
    for i, corpo in enumerate(objetos, start=1):
        offsets.append(len(saida))
        saida += b'%d 0 obj\n' % i + corpo + b'\nendobj\n'
    inicio_xref = len(saida)
    saida += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objetos) + 1)
    for off in offsets:
        saida += b'%010d 00000 n \n' % off
    saida += (b'trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n'
              % (len(objetos) + 1, catalogo, inicio_xref))

    destino.write_bytes(bytes(saida))
    return destino


def main() -> None:
    ap = argparse.ArgumentParser(description='Gera o PDF do sermão a partir da transcrição do culto.')
    ap.add_argument('transcricao', type=Path)
    ap.add_argument('--igreja', required=True)
    ap.add_argument('--data', default=date.today().isoformat())
    ap.add_argument('--saida', type=Path, default=Path('.'))
    ap.add_argument('--slug', default='sermao')
    args = ap.parse_args()

    args.saida.mkdir(parents=True, exist_ok=True)
    por_idioma = ler_transcricao(args.transcricao)
    if not por_idioma:
        raise SystemExit('nenhum trecho encontrado na transcrição')

    for lang, trechos in por_idioma.items():
        paragrafos = montar_paragrafos(trechos)
        if not paragrafos:
            continue
        nome = f"sermao-{args.slug}-{args.data.replace('-', '')}-{lang}.pdf"
        caminho = gerar_pdf(paragrafos, args.igreja, args.data, lang, args.saida / nome)
        palavras = sum(len(p.split()) for p in paragrafos)
        print(f'{lang}: {len(paragrafos)} paragrafos, {palavras} palavras -> {caminho}')


if __name__ == '__main__':
    main()
