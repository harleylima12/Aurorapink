# Tabelas de referência

Arquivos pequenos, versionados no git, que o `preparar_dados.py` usa para deixar os dados apresentáveis.

| Arquivo | O que é | Fonte e licença |
|---|---|---|
| `categorias.csv` | Nome amigável em PT-BR de cada uma das 73 categorias da Olist (`cama_mesa_banho` → "Cama, Mesa e Banho"). Pode editar à vontade; o script falha se faltar alguma categoria. | Escrito à mão para este projeto. |
| `municipios_ibge.csv` | 5.571 municípios com nome oficial e UF, usados para pôr acento nas cidades da Olist ("sao paulo" → "São Paulo"). | Derivado de [kelvins/municipios-brasileiros](https://github.com/kelvins/municipios-brasileiros) (commit `503e2f7`, licença MIT, © 2016 Kelvin S. do Prado), que compila dados públicos do IBGE. Só as colunas `codigo_ibge`, `nome` e `uf`. |
