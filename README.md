# Ofertas Saúde — Agregador de Afiliados

Garimpa ofertas de saúde/bem-estar/odonto no Mercado Livre e AliExpress, filtra com IA,
publica num site estático (GitHub Pages) e num canal Telegram. Roda sozinho via GitHub Actions.

## Fluxo
- **AliExpress**: automático — a API gera o link de afiliado e publica direto.
- **Mercado Livre**: garimpo automático, mas o link é manual. O bot manda a oferta no seu
  Telegram privado; você **responde colando o link de afiliado** e a próxima rodada publica.

## Secrets necessários (Settings → Secrets → Actions)
| Secret | Obrigatório | Para quê |
|---|---|---|
| `TELEGRAM_TOKEN` | sim | bot do Telegram |
| `TELEGRAM_CHAT_ID` | sim | seu chat privado (fila de aprovação) |
| `TELEGRAM_CANAL_ID` | sim | canal público de ofertas |
| `GEMINI_API_KEY` | sim | filtro de relevância |
| `ML_ACCESS_TOKEN` | opcional | só se a API do ML exigir auth |
| `ALIEXPRESS_APP_KEY` / `_APP_SECRET` / `_TRACKING_ID` | opcional | liga a esteira AliExpress |

Sem os secrets do AliExpress, o sistema roda só com Mercado Livre (fallback).

## Rodar local
```bash
npm test
npm start   # precisa das variáveis de ambiente acima
```

## Keywords
Edite `data/keywords.json` para ajustar o nicho.
