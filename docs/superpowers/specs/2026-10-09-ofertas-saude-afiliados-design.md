# Ofertas Saúde — Agregador de Afiliados (Design)

**Data:** 2026-10-09
**Autor:** Jefferson (jfncode) + Claude
**Status:** Aprovado para implementação

## Visão

Site de ofertas de saúde **auto-atualizado** (saúde/bem-estar do consumidor + odonto),
com **canal Telegram** de push e **WhatsApp como extra na fase 2**. Modelo
**semi-automático**: o robô garimpa, filtra e formata as ofertas; o link de afiliado
é inserido automaticamente onde a API permite (AliExpress) e manualmente onde não
permite (Mercado Livre).

Posicionamento: **saúde ampla** — consumidor final (farmácia, cuidado pessoal, fitness,
suplementos, aparelhos domésticos: oxímetro, termômetro, massageador) **+** odonto. O
foco em consumo amplo diferencia de agregadores de insumo odontológico profissional e
abre um mercado maior.

## Arquitetura

Reaproveita o padrão já validado no projeto da Gabriely (GitHub Actions agendado →
`news.json` → site estático), trocando "notícias" por "ofertas". Duas esteiras de
garimpo convergem no mesmo `ofertas.json`:

```
AliExpress (API):  garimpo → filtro IA → gera link via API → PUBLICA DIRETO
Mercado Livre:     garimpo → filtro IA → fila de aprovação → (você cola link) → PUBLICA
                                                     ↓
                                   ofertas.json → site (GitHub Pages) + canal Telegram
```

- **AliExpress**: 100% automático. A API de afiliado busca ofertas E gera o shortlink.
- **Mercado Livre**: garimpo automático (API pública grátis), mas o link de afiliado
  obriga passo manual — passa por uma fila de aprovação no Telegram onde o usuário cola
  o link gerado no painel.

## Componentes

Cada arquivo tem uma responsabilidade única e testável isoladamente:

- `src/garimpo-ml.js` — busca ofertas no Mercado Livre por palavras-chave de saúde/odonto.
  Entrada: lista de keywords. Saída: lista normalizada de ofertas candidatas
  `{fonte, titulo, preco, precoAntigo, desconto, imagem, urlProduto}`.
- `src/garimpo-aliexpress.js` — mesmo contrato, via API de afiliado AliExpress; **já gera
  o link de afiliado** no próprio item (`urlAfiliado`). Isolado atrás de uma flag:
  se não houver credenciais, não roda (fallback para ML-only).
- `src/filtro-ia.js` — recebe candidatas, usa **Gemini (free tier, $0)** para descartar
  itens fora do nicho, categorizar (Saúde / Odonto / Fitness / Cuidado pessoal) e escrever
  título/chamada amigável. Saída: candidatas enriquecidas + aprovadas.
- `src/fila-telegram.js` — para itens SEM `urlAfiliado` (Mercado Livre): envia a oferta
  formatada + a URL do produto ao usuário no Telegram e captura a resposta com o link
  de afiliado colado.
- `src/publicar.js` — grava/atualiza `site/ofertas.json`, faz commit, e posta no canal
  Telegram com botão "🛒 Comprar".
- `site/index.html` + `site/ofertas.json` — site estático (cards de oferta, filtro por
  categoria), no padrão visual jfncode. Servido por GitHub Pages.
- Orquestração: um runner (`src/run.js`) agendado — local (PM2, como o scheduler atual)
  ou GitHub Actions cron (como o robô da Gabriely). Decisão de deploy na fase de plano.

## Dados

`site/ofertas.json` — array de ofertas publicadas:
```json
{
  "id": "ml-MLB123 | ae-456",
  "fonte": "mercadolivre | aliexpress",
  "categoria": "Saúde | Odonto | Fitness | Cuidado pessoal",
  "titulo": "string (copy da IA)",
  "preco": 0.0,
  "precoAntigo": 0.0,
  "desconto": 0,
  "imagem": "url",
  "urlAfiliado": "url",
  "publicadoEm": "ISO-8601"
}
```

## Fontes & custo

- **Fase 1 (MVP)**: Mercado Livre (API pública grátis) + AliExpress (API de afiliado
  grátis). Filtro via Gemini free tier. **Custo: R$ 0.**
- **Fase 2**: Shopee (quando a API de afiliado for aprovada), WhatsApp (Baileys, com cap
  diário e espaçamento anti-ban), domínio próprio. **Sem scraper pago** — só se um dia
  for preciso uma fonte sem API (ex: lojas de dental).

## Tratamento de erros

- Falha de API (ML/AliExpress): loga e segue com o que já tem; não derruba a esteira.
- Sem credenciais AliExpress: a esteira AliExpress é pulada (fallback ML-only) — o MVP
  sobe mesmo sem elas.
- Resposta inválida na fila do Telegram (link que não parece URL): rejeita e repergunta.
- Deduplicação: não republica oferta com `id` já presente em `ofertas.json`.

## Testes

- `garimpo-*`: mock da resposta HTTP → valida normalização do item.
- `filtro-ia`: itens claramente dentro/fora do nicho → valida aprovação/descarte e categoria.
- `fila-telegram`: valida parsing do link colado e rejeição de entrada inválida.
- `publicar`: valida escrita/dedup no `ofertas.json`.

## MVP (escopo da primeira implementação)

Garimpo ML + garimpo AliExpress (atrás de flag de credencial) + filtro Gemini +
fila de aprovação no Telegram (só ML) + `ofertas.json` + site estático GitHub Pages +
post no canal Telegram. **Fora do MVP**: Shopee, WhatsApp, domínio próprio.

## Riscos assumidos

- Link do Mercado Livre continua manual (programa não libera geração automática).
- WhatsApp fora do MVP por risco de ban (viola ToS; link repetido = spam).
- Garimpo depende da estabilidade das APIs (ML estável, mas já mudou no passado).
- AliExpress depende de aprovação como afiliado + credenciais de API (fallback previsto).
- Negócio: o gargalo real é **audiência**, não tecnologia — distribuição precisa de
  esforço próprio (SEO do site + canal Telegram + redes).
