// ============================================================
//  STUB — enviar-push
//  Recebe uma notificação recém-criada (pelo gatilho do banco) ou um
//  pedido de teste (pelo app) e empurra o aviso para os aparelhos da
//  pessoa. Assinatura por VAPID; a chave privada só existe aqui.
//
//  Publicar:
//    supabase functions deploy enviar-push --no-verify-jwt
//
//  Segredos (uma vez só):
//    supabase secrets set VAPID_PUBLIC_KEY=...  VAPID_PRIVATE_KEY=...
//    supabase secrets set VAPID_SUBJECT=mailto:voce@exemplo.com
//
//  --no-verify-jwt é de propósito: quem chama é o gatilho do Postgres,
//  com a service_role key. A checagem de quem pode pedir o quê está
//  logo abaixo, feita à mão.
// ============================================================

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_SUPA = Deno.env.get("SUPABASE_URL")!;
const SERVICE  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUB = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIV = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUB = Deno.env.get("VAPID_SUBJECT") ?? "mailto:stub@exemplo.com";

webpush.setVapidDetails(VAPID_SUB, VAPID_PUB, VAPID_PRIV);

const admin = createClient(URL_SUPA, SERVICE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------- a frase do aviso, igual à do painel dentro do app ----------
type Ctx = Record<string, unknown> | null;

function alvoDe(ctx: Ctx): { direto: string; comPrep: string } | null {
  if (!ctx) return null;
  const obra = typeof ctx.obra === "string" && ctx.obra ? ctx.obra : null;

  if (ctx.alvo === "forum") {
    const sessao = typeof ctx.sessao === "string" ? ctx.sessao : null;
    if (sessao) return { direto: `a sessão ${sessao}`, comPrep: `na sessão ${sessao}` };
    return obra
      ? { direto: `a sessão sobre ${obra}`, comPrep: `na sessão sobre ${obra}` }
      : { direto: "uma sessão do fórum", comPrep: "no fórum" };
  }
  if (ctx.alvo === "post") return { direto: "sua publicação", comPrep: "na sua publicação" };
  if (ctx.alvo === "avaliacao") {
    return obra
      ? { direto: `sua crítica de ${obra}`, comPrep: `na sua crítica de ${obra}` }
      : { direto: "sua crítica", comPrep: "na sua crítica" };
  }
  if (ctx.alvo === "atividade") {
    if (!obra) return { direto: "sua atividade", comPrep: "na sua atividade" };
    switch (ctx.acao) {
      case "rated":
        return { direto: `sua avaliação de ${obra}`, comPrep: `na sua avaliação de ${obra}` };
      case "episode_rated":
        return { direto: `sua avaliação de um episódio de ${obra}`,
                 comPrep: `na sua avaliação de um episódio de ${obra}` };
      case "favorited":
        return { direto: `${obra} nos seus favoritos`, comPrep: `na sua atividade sobre ${obra}` };
      case "watchlisted":
        return { direto: `${obra} na sua lista`, comPrep: `na sua atividade sobre ${obra}` };
      case "series_completed":
        return { direto: `${obra}, que você terminou`, comPrep: `na sua atividade sobre ${obra}` };
      case "achievement_unlocked":
        return { direto: `sua conquista ${obra}`, comPrep: `na sua conquista ${obra}` };
      case "list_created":
        return { direto: `sua coleção ${obra}`, comPrep: `na sua coleção ${obra}` };
      default:
        return { direto: obra, comPrep: `na sua atividade sobre ${obra}` };
    }
  }
  return null;
}

function frase(tipo: string, quem: string, ctx: Ctx): string {
  if (tipo === "achievement") {
    const c = ctx && typeof ctx.conquista === "string" ? ctx.conquista : null;
    return c ? `Você desbloqueou ${c}` : "Você desbloqueou uma conquista";
  }
  if (tipo === "follow") return `${quem} começou a seguir você`;
  if (tipo === "mission") {
    const t = ctx && typeof ctx.titulo === "string" ? ctx.titulo : null;
    const p = ctx && typeof ctx.personagem === "string" ? ctx.personagem : null;
    if (p) return `${p} precisa da sua ajuda${t ? ": " + t : ""}`;
    return t ? `Missão nova: ${t}` : "Uma missão nova chegou";
  }

  const a = alvoDe(ctx);
  if (!a) {
    const genericos: Record<string, string> = {
      like: "curtiu sua publicação",
      comment: "comentou na sua publicação",
      reply: "respondeu seu comentário",
      forum_comment: "comentou na sua sessão",
      forum_reply: "respondeu você no fórum",
    };
    return `${quem} ${genericos[tipo] ?? "interagiu com você"}`;
  }
  if (tipo === "like") return `${quem} curtiu ${a.direto}`;
  if (tipo === "comment" || tipo === "forum_comment") return `${quem} comentou ${a.comPrep}`;
  if (tipo === "reply" || tipo === "forum_reply") return `${quem} respondeu você ${a.comPrep}`;
  return `${quem} interagiu com ${a.direto}`;
}

// para onde o toque na notificação leva
function enderecoDe(alvoTipo: string | null, tipo: string, ctx: Ctx): string {
  if (tipo === "mission") {
    const k = ctx && typeof ctx.missao === "string" ? ctx.missao : null;
    return k ? "./?missao=" + encodeURIComponent(k) : "./?aba=achievements";
  }
  if (alvoTipo === "forum_thread") return "./?aba=forum";
  if (tipo === "achievement") return "./?aba=achievements";
  if (alvoTipo === "post" || alvoTipo === "activity" || alvoTipo === "rating") return "./?aba=timeline";
  return "./";
}

const POSTER = "https://image.tmdb.org/t/p/w185";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") {
    return new Response("método não permitido", { status: 405, headers: CORS });
  }

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return new Response(JSON.stringify({ erro: "json inválido" }), { status: 400, headers: CORS });
  }

  const destino = String(corpo.user_id ?? "");
  if (!destino) {
    return new Response(JSON.stringify({ erro: "sem user_id" }), { status: 400, headers: CORS });
  }

  // ---------- quem pode pedir o envio ----------
  // service_role: é o gatilho do banco, pode mandar pra qualquer um.
  // JWT de usuário: só pode mandar pra si mesmo (é o botão de teste).
  const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  let autorizado = auth === SERVICE;
  if (!autorizado && auth) {
    const { data, error } = await admin.auth.getUser(auth);
    autorizado = !error && !!data?.user && data.user.id === destino;
  }
  if (!autorizado) {
    return new Response(JSON.stringify({ erro: "não autorizado" }), { status: 401, headers: CORS });
  }

  // ---------- o que dizer ----------
  const ctx = (corpo.context ?? null) as Ctx;
  const tipo = String(corpo.tipo ?? "");
  const quem = String(corpo.quem ?? "Alguém");
  const alvoTipo = corpo.alvoTipo ? String(corpo.alvoTipo) : null;

  const titulo = corpo.titulo ? String(corpo.titulo) : "STUB";
  const texto = corpo.corpo ? String(corpo.corpo) : frase(tipo, quem, ctx);
  const preview = corpo.preview ? String(corpo.preview) : null;
  const capa = ctx && typeof ctx.capa === "string" ? POSTER + ctx.capa : null;

  const carga = JSON.stringify({
    titulo,
    // a frase é o que interessa; o trecho do comentário entra embaixo
    corpo: preview ? `${texto}\n"${preview}"` : texto,
    imagem: capa,
    // avisos do mesmo alvo se substituem em vez de empilhar na tela
    tag: alvoTipo && corpo.alvoId ? `${alvoTipo}:${corpo.alvoId}` : "stub",
    url: corpo.url ? String(corpo.url) : enderecoDe(alvoTipo, tipo, ctx),
    tipo,
    alvoTipo,
    alvoId: corpo.alvoId ?? null,
    missao: ctx && typeof ctx.missao === "string" ? ctx.missao : null,
    ator: corpo.ator ?? null,
  });

  // ---------- para quais aparelhos ----------
  const { data: assinaturas, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", destino);

  if (error) {
    return new Response(JSON.stringify({ erro: error.message }), { status: 500, headers: CORS });
  }
  if (!assinaturas?.length) {
    return new Response(JSON.stringify({ enviados: 0, motivo: "nenhum aparelho" }), { headers: CORS });
  }

  let enviados = 0;
  const mortos: string[] = [];

  await Promise.all(assinaturas.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        carga,
        { TTL: 60 * 60 * 24 },
      );
      enviados++;
    } catch (e) {
      // 404/410 = o navegador descartou a assinatura; some com ela
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) mortos.push(s.endpoint);
      else console.error("falha ao enviar:", status, (e as Error).message);
    }
  }));

  if (mortos.length) {
    await admin.from("push_subscriptions").delete().in("endpoint", mortos);
  }

  return new Response(JSON.stringify({ enviados, removidos: mortos.length }), { headers: CORS });
});
