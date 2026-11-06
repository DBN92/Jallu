# Publicação pelo Cloudflare Tunnel

A DIA é um único serviço HTTP (API + PWA + WebSocket) na porta `LUNA_PORT` (padrão **8787**).
O objetivo é reaproveitar o **túnel que você já tem** — sem criar outro e sem expor portas no roteador.

> ⚠️ Não publique o Home Assistant por causa da DIA. Quem fala com o HA é o backend da DIA, pela rede local.

## 1. Descubra como o seu túnel roda

Rode `bash scripts/diagnose.sh` e veja a seção **Cloudflare Tunnel**:

| Situação | O que fazer |
|---|---|
| Túnel gerenciado pelo painel (instalado com `--token`, comum em apps do ZimaOS) | Passo 2A |
| Túnel com `config.yml` local (`/etc/cloudflared/config.yml`) | Passo 2B |

## 2A. Túnel gerenciado pelo painel (recomendado)

1. Acesse **Cloudflare Zero Trust › Networks › Tunnels** e abra o túnel existente.
2. Aba **Public Hostname › Add a public hostname**:
   - **Subdomain:** `luna` · **Domain:** `seudominio.com`
   - **Service type:** `HTTP`
   - **URL:**
     - `127.0.0.1:8787` se o `cloudflared` roda diretamente no host;
     - `IP-DO-SERVIDOR:8787` (ex.: `192.168.0.10:8787`) se o `cloudflared` roda como **app/contêiner** do ZimaOS —
       dentro do contêiner, `127.0.0.1` é o próprio contêiner. Nesse caso mantenha `LUNA_HOST=0.0.0.0`.
3. Salve. Não é preciso reiniciar o túnel.

## 2B. Túnel com config.yml local

Acrescente somente a regra da DIA ao `ingress` (antes do `http_status:404`), conforme
[`infra/cloudflare/config.example.yml`](../infra/cloudflare/config.example.yml), e recarregue o `cloudflared`
**do jeito que ele já é gerenciado no seu sistema**. Faça backup do arquivo antes.

## 3. Configure a DIA

No `.env`:

```env
LUNA_PUBLIC_URL=https://luna.seudominio.com
LUNA_TRUST_PROXY=true
LUNA_COOKIE_SECURE=auto
```

Reinicie: `bash scripts/stop.sh && bash scripts/start.sh` e teste: `bash scripts/health-check.sh --public`.

## 4. Proteja com Cloudflare Access (fortemente recomendado)

A DIA já tem login próprio, rate limiting e CSRF, mas o Access adiciona uma barreira **antes** do tráfego chegar à sua casa.

1. **Zero Trust › Access › Applications › Add application › Self-hosted**
2. **Application domain:** `luna.seudominio.com`
3. **Policy:** *Allow* → *Emails* → seu e-mail (login por código enviado ao e-mail ou Google).
4. **Session duration:** 1 mês (evita pedir login toda hora no iPhone).
5. **Ícone/manifest do PWA:** para o iPhone exibir o ícone correto ao “Adicionar à Tela de Início”,
   crie uma segunda aplicação Access com política **Bypass** apenas para estes caminhos públicos e inofensivos:
   `/manifest.webmanifest`, `/apple-touch-icon.png`, `/icon-192.png`, `/icon-512.png`, `/icon-maskable-512.png`, `/favicon.svg`.

> Faça o login do Access **no Safari** antes de instalar o PWA. Se a sessão do Access expirar dentro do app instalado,
> abra o domínio no Safari, entre novamente e volte ao app.

## 5. HTTPS e recursos do iPhone

Microfone, geolocalização e instalação como PWA exigem **HTTPS**. Pela rede local em `http://IP:8787` a interface abre,
mas o Safari bloqueia microfone e GPS. Use o domínio do Cloudflare também em casa (funciona normalmente).

## WebSocket

O Cloudflare Tunnel suporta WebSocket nativamente; não há configuração extra. O app reconecta sozinho ao voltar do segundo plano.
