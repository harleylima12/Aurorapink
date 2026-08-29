export type VeiculoStatus = "disponivel" | "vendido";

/** A vehicle as the public site renders it (photos already ordered). */
export interface Veiculo {
  id: string;
  marca: string;
  modelo: string;
  ano: number;
  km: number;
  preco: number;
  combustivel: string;
  cambio: string;
  cor: string;
  status: VeiculoStatus;
  destaque?: boolean;
  fotos: string[];
}
