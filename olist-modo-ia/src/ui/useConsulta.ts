import { useEffect, useMemo, useState } from 'react';

import type { Linha } from '../data/duckdb';
import { compilar, type SqlCompilado } from '../query/compiler';
import type { QuerySpec } from '../query/spec';
import { useDados } from './contexto';

export interface ResultadoConsulta {
  spec: QuerySpec;
  compilado: SqlCompilado;
  linhas: Linha[];
  ms: number;
  doCache: boolean;
}

export type EstadoConsulta =
  | { status: 'carregando'; anterior: ResultadoConsulta | null }
  | { status: 'ok'; resultado: ResultadoConsulta }
  | { status: 'erro'; mensagem: string };

/** Compila o spec e roda no DuckDB. Enquanto recarrega (filtro mudou), mantém o resultado anterior na tela. */
export function useConsulta(spec: QuerySpec): EstadoConsulta {
  const { motor, semantica } = useDados();
  const chave = JSON.stringify(spec);
  const [estado, setEstado] = useState<EstadoConsulta>({ status: 'carregando', anterior: null });

  const compilado = useMemo(() => {
    try {
      return { ok: true as const, spec, sql: compilar(spec, semantica) };
    } catch (erro) {
      return { ok: false as const, mensagem: erro instanceof Error ? erro.message : String(erro) };
    }
    // O spec é recriado a cada render; a chave (JSON) diz se ele mudou de verdade.
  }, [chave, semantica]);

  useEffect(() => {
    if (!compilado.ok) {
      setEstado({ status: 'erro', mensagem: compilado.mensagem });
      return;
    }
    let ativo = true;
    setEstado((atual) => ({ status: 'carregando', anterior: atual.status === 'ok' ? atual.resultado : atual.status === 'carregando' ? atual.anterior : null }));
    motor
      .consultar(compilado.sql.sql, compilado.sql.params)
      .then((r) => {
        if (ativo) {
          setEstado({
            status: 'ok',
            resultado: { spec: compilado.spec, compilado: compilado.sql, linhas: r.linhas, ms: r.ms, doCache: r.doCache },
          });
        }
      })
      .catch((erro: unknown) => {
        if (ativo) setEstado({ status: 'erro', mensagem: erro instanceof Error ? erro.message : String(erro) });
      });
    return () => {
      ativo = false;
    };
  }, [motor, compilado]);

  return estado;
}

export function resultadoAtual(estado: EstadoConsulta): ResultadoConsulta | null {
  if (estado.status === 'ok') return estado.resultado;
  if (estado.status === 'carregando') return estado.anterior;
  return null;
}
