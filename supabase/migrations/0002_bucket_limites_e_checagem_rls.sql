-- =====================================================================
-- PARTE 1 — Validação de upload no servidor (obrigatória)
-- =====================================================================
-- O upload vai do navegador direto para o Storage: nenhum código nosso
-- fica no caminho. A validação do formulário é conveniência de UX e é
-- contornável por quem montar a requisição na mão. A checagem real de
-- tipo e tamanho é esta, aplicada pelo próprio Supabase no bucket.

update storage.buckets
set
  file_size_limit = 8388608, -- 8 MB por arquivo
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'fotos-veiculos';

-- Confira que aplicou:
select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'fotos-veiculos';


-- =====================================================================
-- PARTE 2 — Auditoria das políticas de RLS (somente leitura)
-- =====================================================================
-- Nada aqui altera dados. Rode e confira os resultados.

-- 2.1 RLS precisa estar ATIVA nas três tabelas. rowsecurity = true.
select relname as tabela, relrowsecurity as rls_ativa, relforcerowsecurity as rls_forcada
from pg_class
where oid in ('public.veiculos'::regclass,
              'public.veiculo_fotos'::regclass,
              'public.perfis'::regclass);

-- 2.2 Todas as políticas existentes, com o comando e a expressão.
--     Espere: leitura pública (SELECT) liberada; INSERT/UPDATE/DELETE
--     restritos a admin; perfis visível só ao dono ou a admin.
select schemaname, tablename, policyname, cmd, roles,
       qual as condicao_leitura, with_check as condicao_escrita
from pg_policies
where schemaname in ('public', 'storage')
  and (tablename in ('veiculos', 'veiculo_fotos', 'perfis') or tablename = 'objects')
order by tablename, cmd, policyname;

-- 2.3 Tabela com RLS ativa e ZERO políticas fica inacessível; tabela
--     sem RLS fica totalmente aberta. Nenhuma das duas deve aparecer.
select c.relname as tabela,
       c.relrowsecurity as rls_ativa,
       count(p.policyname) as qtd_politicas
from pg_class c
left join pg_policies p
  on p.tablename = c.relname and p.schemaname = 'public'
where c.oid in ('public.veiculos'::regclass,
                'public.veiculo_fotos'::regclass,
                'public.perfis'::regclass)
group by c.relname, c.relrowsecurity;


-- =====================================================================
-- PARTE 3 — Teste prático: um cliente comum NÃO pode escrever
-- =====================================================================
-- Simula uma requisição autenticada como um usuário de role 'cliente'
-- e tenta escrever. O esperado é que TODAS as tentativas falhem.
-- Rode dentro de uma transação que sempre volta atrás, para não sujar
-- o banco mesmo se alguma passar.

begin;

-- Pegue um usuário não-admin real para o teste:
select p.id, p.role
from public.perfis p
where p.role <> 'admin'
limit 1;

-- Cole o id acima nas duas linhas abaixo e rode o bloco inteiro.
-- (Se não houver nenhum cliente cadastrado, crie uma conta pelo site
--  em /conta/cadastrar e repita.)
set local role authenticated;
set local request.jwt.claims = '{"sub":"COLE_O_ID_AQUI","role":"authenticated"}';

-- Esperado: ERRO de política (new row violates row-level security).
insert into public.veiculos (marca, modelo, ano, km, preco, combustivel, cambio, cor)
values ('Teste', 'Invasao', 2024, 0, 1, 'Flex', 'Manual', 'Preto');

-- Esperado: 0 linhas afetadas (a política não deixa enxergar para editar).
update public.veiculos set preco = 1 where true;

-- Esperado: 0 linhas afetadas.
delete from public.veiculos where true;

-- Esperado: 0 linhas afetadas (só o próprio perfil, e sem virar admin).
update public.perfis set role = 'admin' where true;

rollback;
