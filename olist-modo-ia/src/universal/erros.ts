/** Erro com dica de como resolver (aparece na tela, em vez de uma mensagem técnica). */
export class ErroPlanilha extends Error {
  constructor(
    mensagem: string,
    readonly dica?: string,
  ) {
    super(mensagem);
  }
}
