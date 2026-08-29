export type VeiculoStatus = "disponivel" | "vendido";

/** One photo of a vehicle, with the optional label the admin assigned. */
export interface VeiculoFoto {
  url: string;
  /** Free text ("Frente", "Motor", ...); null when the admin left it blank. */
  categoria: string | null;
}

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
  fotos: VeiculoFoto[];
}
