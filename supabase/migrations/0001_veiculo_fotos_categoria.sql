-- Adiciona a categoria (rótulo) opcional de cada foto do veículo.
--
-- Coluna nullable e sem default: as fotos já cadastradas continuam
-- intactas e simplesmente ficam sem categoria (a página de detalhe
-- mostra só o número nesse caso). Nenhum dado é perdido ou reescrito.
--
-- Texto livre de propósito — "Frente", "Lateral", "Traseira", "Interior",
-- "Motor", "Rodas" e "Outro" são apenas as sugestões oferecidas no
-- formulário do admin, não uma lista fechada. Por isso não há CHECK nem
-- enum aqui: um valor novo não exige outra migração.
--
-- Seguro rodar mais de uma vez (if not exists).

alter table public.veiculo_fotos
  add column if not exists categoria text;

comment on column public.veiculo_fotos.categoria is
  'Rótulo opcional da foto, texto livre. Sugestões no admin: Frente, Lateral, Traseira, Interior, Motor, Rodas, Outro. NULL = sem rótulo.';
