/**
 * Acesso não-custodial à exchange do utilizador (Binance).
 *
 * O Cripto Jarvis nunca guarda fundos: usa as chaves API do próprio utilizador
 * para enviar instruções para a conta dele. As chaves são cifradas em repouso
 * (AES-GCM) com a chave de servidor EXCHANGE_ENC_KEY e nunca voltam ao browser.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

async function aesKey(): Promise<CryptoKey> {
  const secret = process.env["EXCHANGE_ENC_KEY"];
  if (!secret) throw new Error("Falta a chave de cifra do servidor.");
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));

const fromB64 = (value: string) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

export async function encryptSecret(plain: string): Promise<string> {
  const key = await aesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain));
  return `${b64(iv)}.${b64(cipher)}`;
}

export async function decryptSecret(payload: string): Promise<string> {
  const [ivPart, dataPart] = payload.split(".");
  if (!ivPart || !dataPart) throw new Error("Credencial inválida.");
  const key = await aesKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(ivPart) },
    key,
    fromB64(dataPart),
  );
  return dec.decode(plain);
}

/** Máscara pública: nunca devolvemos a chave completa ao frontend. */
export const maskKey = (key: string) => `••••${key.slice(-4)}`;

async function sign(query: string, apiSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(query));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Binance tem vários hosts equivalentes; alguns estão bloqueados por região. */
const HOSTS = [
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api-gcp.binance.com",
];

function describeNonJson(status: number, text: string): string {
  const snippet = text.trim().slice(0, 120);
  if (status === 451 || status === 403 || /restricted|unavailable|cloudfront|access denied/i.test(snippet)) {
    return `A Binance recusou o pedido do nosso servidor (HTTP ${status} — restrição geográfica ou de IP). Se limitaste a chave por IP, remove essa restrição ou usa uma chave sem limite de IP.`;
  }
  return `A Binance devolveu uma resposta inesperada (HTTP ${status}). Tenta novamente dentro de alguns minutos.`;
}

async function signedRequest(
  path: string,
  params: Record<string, string>,
  creds: { apiKey: string; apiSecret: string },
  method: "GET" | "POST" = "GET",
): Promise<unknown> {
  let lastError: Error | null = null;

  for (const host of HOSTS) {
    const query = new URLSearchParams({
      ...params,
      timestamp: String(Date.now()),
      recvWindow: "10000",
    }).toString();
    const signature = await sign(query, creds.apiSecret);
    const url = `${host}${path}?${query}&signature=${signature}`;

    let res: Response;
    try {
      res = await fetch(url, { method, headers: { "X-MBX-APIKEY": creds.apiKey } });
    } catch {
      lastError = new Error("Não foi possível contactar a Binance. Tenta novamente.");
      continue;
    }

    const text = await res.text();
    let body: { msg?: string; code?: number } | null = null;
    try {
      body = JSON.parse(text) as { msg?: string; code?: number };
    } catch {
      // Resposta HTML (bloqueio regional/WAF): não é um erro de chave.
      lastError = new Error(describeNonJson(res.status, text));
      continue;
    }

    if (!res.ok) {
      // Erro legítimo da API (chave inválida, permissões, etc.): não vale tentar outro host.
      throw new Error(body?.msg ? `Binance: ${body.msg}` : `Binance devolveu HTTP ${res.status}`);
    }
    return body;
  }

  throw lastError ?? new Error("Falha na comunicação com a Binance.");
}


export type ExchangeBalance = {
  totalUsdt: number;
  assets: { asset: string; free: number; locked: number }[];
  canTrade: boolean;
  canWithdraw: boolean;
};

/**
 * Verificação apenas de leitura: confirma que as chaves funcionam e mostra o
 * saldo real antes de o utilizador poder ligar o modo real.
 */
export async function fetchBalance(creds: {
  apiKey: string;
  apiSecret: string;
}): Promise<ExchangeBalance> {
  const account = (await signedRequest("/api/v3/account", {}, creds)) as {
    canTrade?: boolean;
    canWithdraw?: boolean;
    balances?: { asset: string; free: string; locked: string }[];
  };
  const assets = (account.balances ?? [])
    .map((b) => ({ asset: b.asset, free: Number(b.free), locked: Number(b.locked) }))
    .filter((b) => b.free + b.locked > 0)
    .sort((a, b) => b.free - a.free)
    .slice(0, 20);

  const stable = assets
    .filter((a) => ["USDT", "USDC", "BUSD", "FDUSD"].includes(a.asset))
    .reduce((sum, a) => sum + a.free + a.locked, 0);

  return {
    totalUsdt: Number(stable.toFixed(2)),
    assets,
    canTrade: Boolean(account.canTrade),
    canWithdraw: Boolean(account.canWithdraw),
  };
}

/** Ordem de mercado real na conta do próprio utilizador (valor em moeda de cotação). */
export async function placeMarketOrder(
  creds: { apiKey: string; apiSecret: string },
  input: { symbol: string; side: "BUY" | "SELL"; quoteOrderQty: number },
): Promise<{ orderId: string; executedQty: string }> {
  const body = (await signedRequest(
    "/api/v3/order",
    {
      symbol: input.symbol.toUpperCase(),
      side: input.side,
      type: "MARKET",
      quoteOrderQty: input.quoteOrderQty.toFixed(2),
    },
    creds,
    "POST",
  )) as { orderId?: number; executedQty?: string };
  return { orderId: String(body.orderId ?? ""), executedQty: body.executedQty ?? "0" };
}

/** Lê e decifra as credenciais guardadas (só em contexto de servidor). */
export async function loadCredentials(userId: string): Promise<{
  apiKey: string;
  apiSecret: string;
} | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("exchange_secrets")
    .select("api_key_cipher,api_secret_cipher")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    apiKey: await decryptSecret(data.api_key_cipher),
    apiSecret: await decryptSecret(data.api_secret_cipher),
  };
}
