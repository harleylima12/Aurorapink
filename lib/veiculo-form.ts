export const COMBUSTIVEIS = [
  "Flex",
  "Gasolina",
  "Diesel",
  "Elétrico",
  "Híbrido",
] as const;

export const CAMBIOS = ["Manual", "Automático"] as const;

export const FOTOS_BUCKET = "fotos-veiculos";

/** Accepted image types. Mirrored by the bucket policy (migration 0002). */
export const TIPOS_FOTO_ACEITOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** 8 MB per photo, matching the bucket's own file_size_limit. */
export const TAMANHO_MAX_FOTO = 8 * 1024 * 1024;

/**
 * Checks one picked file. Returns null when it's fine, or a message
 * naming the file and what's wrong with it.
 */
export function validarFoto(file: File): string | null {
  if (!TIPOS_FOTO_ACEITOS.includes(file.type as (typeof TIPOS_FOTO_ACEITOS)[number])) {
    return `${file.name}: formato não aceito (use JPG, PNG ou WebP).`;
  }
  if (file.size > TAMANHO_MAX_FOTO) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return `${file.name}: ${mb} MB excede o limite de 8 MB por foto.`;
  }
  return null;
}

/**
 * Suggested labels for a photo. The column is free text, so these are
 * only the shortcuts offered in the form — anything else is still valid.
 */
export const CATEGORIAS_FOTO = [
  "Frente",
  "Lateral",
  "Traseira",
  "Interior",
  "Motor",
  "Rodas",
  "Outro",
] as const;

/** Form state. Numeric fields stay as strings while the user types. */
export interface VeiculoFormValues {
  marca: string;
  modelo: string;
  ano: string;
  km: string;
  preco: string;
  combustivel: string;
  cambio: string;
  cor: string;
  descricao: string;
  destaque: boolean;
}

/** Shape sent to the server once the strings have been parsed. */
export interface VeiculoInput {
  marca: string;
  modelo: string;
  ano: number;
  km: number;
  preco: number;
  combustivel: string;
  cambio: string;
  cor: string;
  descricao: string;
  destaque: boolean;
}

export type VeiculoFormErrors = Partial<
  Record<"marca" | "modelo" | "ano" | "preco" | "fotos", string>
>;

export const emptyVeiculoForm: VeiculoFormValues = {
  marca: "",
  modelo: "",
  ano: "",
  km: "",
  preco: "",
  combustivel: COMBUSTIVEIS[0],
  cambio: CAMBIOS[0],
  cor: "",
  descricao: "",
  destaque: false,
};

/** Strips everything but digits, capped so the value stays sane. */
export function onlyDigits(value: string, maxLength = 15): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

/**
 * Currency mask: the user types digits and they fill in from the right,
 * so "12990" reads as R$ 129,90. Returns "" for empty input so the
 * placeholder still shows.
 */
export function maskCurrency(value: string): string {
  const digits = onlyDigits(value, 11);
  if (!digits) return "";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(digits) / 100);
}

/** Turns a masked currency string back into a number (reais). */
export function parseCurrency(masked: string): number {
  const digits = onlyDigits(masked, 11);
  return digits ? Number(digits) / 100 : 0;
}

/** Renders a stored number back into the masked input format. */
export function currencyToInput(value: number): string {
  return maskCurrency(String(Math.round(value * 100)));
}

/** Groups thousands for the km field ("32000" -> "32.000"). */
export function maskInteger(value: string): string {
  const digits = onlyDigits(value, 9);
  if (!digits) return "";
  return new Intl.NumberFormat("pt-BR").format(Number(digits));
}

export function parseInteger(masked: string): number {
  const digits = onlyDigits(masked, 9);
  return digits ? Number(digits) : 0;
}

/**
 * Validates the required fields (marca, modelo, ano, preço, and at least
 * one photo). Returns a map of field -> message; empty means valid.
 */
export function validateVeiculo(
  values: VeiculoFormValues,
  fotosCount: number
): VeiculoFormErrors {
  const errors: VeiculoFormErrors = {};
  const anoAtual = new Date().getFullYear();

  if (!values.marca.trim()) {
    errors.marca = "Informe a marca.";
  }

  if (!values.modelo.trim()) {
    errors.modelo = "Informe o modelo.";
  }

  const ano = Number(onlyDigits(values.ano, 4));
  if (!values.ano.trim()) {
    errors.ano = "Informe o ano.";
  } else if (ano < 1900 || ano > anoAtual + 1) {
    errors.ano = `Informe um ano entre 1900 e ${anoAtual + 1}.`;
  }

  if (parseCurrency(values.preco) <= 0) {
    errors.preco = "Informe um preço maior que zero.";
  }

  if (fotosCount < 1) {
    errors.fotos = "Adicione ao menos uma foto do veículo.";
  }

  return errors;
}

export function toVeiculoInput(values: VeiculoFormValues): VeiculoInput {
  return {
    marca: values.marca.trim(),
    modelo: values.modelo.trim(),
    ano: Number(onlyDigits(values.ano, 4)),
    km: parseInteger(values.km),
    preco: parseCurrency(values.preco),
    combustivel: values.combustivel,
    cambio: values.cambio,
    cor: values.cor.trim(),
    descricao: values.descricao.trim(),
    destaque: values.destaque,
  };
}
