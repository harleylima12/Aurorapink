/** Caminho SVG de uma minissérie (valores vazios quebram a linha). Função pura. */
export function caminhoSparkline(valores: readonly (number | null)[], largura: number, altura: number, margem = 2): string {
  const numeros = valores.filter((v): v is number => v !== null && Number.isFinite(v));
  if (numeros.length < 2) return '';
  const min = Math.min(...numeros);
  const max = Math.max(...numeros);
  const faixa = max - min || 1;
  const passo = valores.length > 1 ? (largura - 2 * margem) / (valores.length - 1) : 0;
  let caminho = '';
  let desenhando = false;
  valores.forEach((v, i) => {
    if (v === null || !Number.isFinite(v)) {
      desenhando = false;
      return;
    }
    const x = margem + i * passo;
    const y = altura - margem - ((v - min) / faixa) * (altura - 2 * margem);
    caminho += `${desenhando ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `;
    desenhando = true;
  });
  return caminho.trim();
}
