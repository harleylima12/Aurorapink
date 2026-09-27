"""Monta docs/demo.gif com os quadros de docs/gif/quadros/ (gerados por PRINTS=1 npx playwright test portfolio).

Uso: .venv/bin/python scripts/montar_gif.py   (precisa do Pillow: pip install pillow==11.3.0)
Cada quadro fica o tempo de leitura dele; paleta de 256 cores por quadro, reduzido para 960 px de largura.
"""
from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parent.parent
QUADROS = RAIZ / "docs" / "gif" / "quadros"
SAIDA = RAIZ / "docs" / "demo.gif"
LARGURA = 960
# Milissegundos por quadro, pelo nome (o resto usa o padrão).
TEMPOS = {"dashboard": 2200, "pergunta": 1200, "resposta": 2600, "follow-up": 2400, "como-calculei": 2600,
          "planilha-entrada": 1800, "entendi-assim": 2400, "objetivo": 1600, "dashboard-tema": 2800, "avaliacao": 3200}


def main() -> None:
    arquivos = sorted(QUADROS.glob("*.png"))
    if not arquivos:
        raise SystemExit("sem quadros: rode PRINTS=1 npx playwright test portfolio")
    quadros, tempos = [], []
    for arquivo in arquivos:
        img = Image.open(arquivo).convert("RGB")
        altura = round(img.height * LARGURA / img.width)
        img = img.resize((LARGURA, altura), Image.LANCZOS)
        quadros.append(img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE))
        tempos.append(TEMPOS.get(arquivo.stem.split("-", 1)[1], 2000))
    quadros[0].save(SAIDA, save_all=True, append_images=quadros[1:], duration=tempos, loop=0, optimize=True)
    print(f"{SAIDA.relative_to(RAIZ)}: {len(quadros)} quadros, {sum(tempos) / 1000:.1f} s, {SAIDA.stat().st_size / 1e6:.2f} MB")


if __name__ == "__main__":
    main()
