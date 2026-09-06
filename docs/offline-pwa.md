# Instalação e funcionamento offline

## Objetivo

Runas Tools e Runas DM são PWAs instaláveis. A opção de instalação aparece somente nas telas iniciais:

- Runas Tools: rota `/`;
- Runas DM: Bestiário, nunca na Mesa ou nos editores.

Depois do primeiro acesso online e da conclusão do cache, cálculos, fichas, testes, dano, importação e exportação funcionam sem rede.

## Responsabilidades de armazenamento

- Cache Storage guarda somente o shell, JavaScript, CSS, fontes e ícones.
- IndexedDB guarda fichas e configurações locais.
- D1 é backup remoto opcional e não participa da inicialização nem dos cálculos.
- `/api/backup`, autenticação e rotas `/cdn-cgi/` nunca entram no cache.
- `navigator.storage.persist()` é solicitado após a instalação aceita para reduzir remoções automáticas.

## Atualizações

Cada build publicado recebe automaticamente um novo nome de cache, derivado do commit ou do conteúdo do artefato. O service worker novo prepara seu cache e remove apenas caches antigos que usem o prefixo do próprio aplicativo. Payloads RSC e respostas de prefetch nunca entram no Cache Storage, pois pertencem a um único build. Nunca remova caches de outro projeto.

Uma atualização que altera `Character` também exige incremento de `CHARACTER_VERSION` e migração do IndexedDB. O cache de aplicação e os dados do usuário têm ciclos independentes.

## Validação obrigatória

Antes de publicar:

1. Execute typecheck, lint, testes e builds dos dois aplicativos.
2. Confirme que `sw.js`, manifesto e ícones 192/512 existem nos artefatos.
3. Em produção, abra uma vez online até aparecer `Offline pronto`.
4. Desative a rede, recarregue e valide criação/edição de ficha, teste, dano e exportação.
5. Confirme que Backup e Sincronizar falham de forma informativa e não alteram os dados locais.
6. Reative a rede e confirme a atualização do backup.

## Limites

Uma PWA precisa de um primeiro acesso HTTPS para ser instalada. Limpar os dados do site ou remover o perfil do navegador pode apagar IndexedDB e caches; por isso exportação JSON e D1 continuam necessários.
