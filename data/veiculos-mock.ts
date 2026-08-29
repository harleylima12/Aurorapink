export type VeiculoStatus = "disponivel" | "vendido";

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

const framePath = (frame: number) =>
  `/hero-frames/frame-${String(frame).padStart(3, "0")}.jpg`;

// Placeholder gallery: reuses the hero animation frames as generic car
// photos until real inventory photography is available. Each vehicle
// gets 5 frames spread across the sequence for a bit of visual variety.
const placeholderFotos = (seed: number): string[] =>
  [0, 60, 120, 180, 240].map((offset) => framePath(((seed * 41 + offset) % 300) + 1));

export const veiculosMock: Veiculo[] = [
  {
    id: "chevrolet-onix-2022",
    marca: "Chevrolet",
    modelo: "Onix 1.0 Turbo LT",
    ano: 2022,
    km: 32000,
    preco: 79900,
    combustivel: "Flex",
    cambio: "Automático",
    cor: "Branco",
    status: "disponivel",
    destaque: true,
    fotos: placeholderFotos(1),
  },
  {
    id: "volkswagen-tcross-2023",
    marca: "Volkswagen",
    modelo: "T-Cross 200 TSI Comfortline",
    ano: 2023,
    km: 18500,
    preco: 118900,
    combustivel: "Flex",
    cambio: "Automático",
    cor: "Cinza",
    status: "disponivel",
    destaque: true,
    fotos: placeholderFotos(2),
  },
  {
    id: "fiat-argo-2021",
    marca: "Fiat",
    modelo: "Argo 1.3 Drive",
    ano: 2021,
    km: 45200,
    preco: 64900,
    combustivel: "Flex",
    cambio: "Manual",
    cor: "Vermelho",
    status: "vendido",
    fotos: placeholderFotos(3),
  },
  {
    id: "toyota-corolla-2020",
    marca: "Toyota",
    modelo: "Corolla 2.0 XEi",
    ano: 2020,
    km: 58000,
    preco: 109900,
    combustivel: "Flex",
    cambio: "Automático",
    cor: "Prata",
    status: "disponivel",
    fotos: placeholderFotos(4),
  },
  {
    id: "hyundai-hb20-2022",
    marca: "Hyundai",
    modelo: "HB20 1.0 Comfort",
    ano: 2022,
    km: 27800,
    preco: 71900,
    combustivel: "Flex",
    cambio: "Manual",
    cor: "Preto",
    status: "disponivel",
    fotos: placeholderFotos(5),
  },
  {
    id: "jeep-compass-2023",
    marca: "Jeep",
    modelo: "Compass 1.3 T270 Longitude",
    ano: 2023,
    km: 12300,
    preco: 179900,
    combustivel: "Flex",
    cambio: "Automático",
    cor: "Branco",
    status: "disponivel",
    destaque: true,
    fotos: placeholderFotos(6),
  },
  {
    id: "honda-civic-2019",
    marca: "Honda",
    modelo: "Civic 2.0 EXL",
    ano: 2019,
    km: 67500,
    preco: 98900,
    combustivel: "Flex",
    cambio: "Automático",
    cor: "Cinza",
    status: "vendido",
    fotos: placeholderFotos(7),
  },
  {
    id: "renault-kwid-2021",
    marca: "Renault",
    modelo: "Kwid 1.0 Zen",
    ano: 2021,
    km: 39900,
    preco: 52900,
    combustivel: "Flex",
    cambio: "Manual",
    cor: "Laranja",
    status: "disponivel",
    fotos: placeholderFotos(8),
  },
  {
    id: "ford-ka-2020",
    marca: "Ford",
    modelo: "Ka 1.0 SE",
    ano: 2020,
    km: 51200,
    preco: 58900,
    combustivel: "Flex",
    cambio: "Manual",
    cor: "Prata",
    status: "disponivel",
    fotos: placeholderFotos(9),
  },
];
