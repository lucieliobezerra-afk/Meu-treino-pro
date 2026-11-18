import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Faça login para usar o assistente." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!supabaseUrl || !supabaseAnonKey || !openaiKey) {
    return json({ error: "O assistente ainda não foi configurado no servidor." }, 503);
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sessão inválida. Entre novamente na sua conta." }, 401);

  let body: { messages?: Array<{ role: string; content: string }>; context?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Não foi possível ler sua mensagem." }, 400);
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-16) : [];
  const valid = messages.length > 0 &&
    messages.every((m) => (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" && m.content.trim().length > 0 && m.content.length <= 4000);
  if (!valid) return json({ error: "Envie uma conversa válida (até 16 mensagens recentes)." }, 400);

  const context = typeof body.context === "string" ? body.context.slice(0, 7000) : "";
  const instructions = `Você é o Assistente de Treino do aplicativo Meu Treino Pro. Responda em português do Brasil, com clareza, acolhimento e objetividade.
Ajude com musculação, técnica geral dos exercícios, organização de treino, séries, repetições, descanso, progressão de cargas e substituições por exercícios equivalentes.
Use os dados do perfil e da ficha enviados como contexto, sem inventar medidas, cargas ou resultados. Ao sugerir substituições, considere o grupo muscular, o padrão de movimento e os equipamentos disponíveis informados.
Priorize técnica correta, progressão gradual, recuperação e consistência. Não incentive treinar com dor. Não diagnostique lesões nem prescreva tratamentos; diante de dor persistente, lesão, sintomas preocupantes ou condições clínicas, oriente avaliação de profissional de saúde.
Não prometa resultados nem recomende anabolizantes ou substâncias perigosas. Explique quando uma recomendação depende de avaliação presencial.
Contexto atual do usuário no Meu Treino Pro:
${context || "Nenhum dado de perfil foi informado."}`;

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.5",
        instructions,
        input: messages.map((m) => ({ role: m.role, content: m.content })),
        max_output_tokens: 800,
        store: false,
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("OpenAI API error:", response.status, result?.error?.code || "unknown");
      return json({ error: "Não consegui responder agora. Verifique a configuração e tente novamente." }, 502);
    }

    const answer = (result.output || [])
      .filter((item: { type?: string }) => item.type === "message")
      .flatMap((item: { content?: Array<{ type?: string; text?: string }> }) => item.content || [])
      .filter((part: { type?: string }) => part.type === "output_text")
      .map((part: { text?: string }) => part.text || "")
      .join("\n")
      .trim();

    if (!answer) return json({ error: "A IA não retornou uma resposta. Tente novamente." }, 502);
    return json({ answer });
  } catch (error) {
    console.error("Assistant request failed:", error);
    return json({ error: "Falha de conexão com o assistente. Tente novamente." }, 500);
  }
});
