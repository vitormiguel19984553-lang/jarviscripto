import { createFileRoute, useNavigate, useSearch, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Cripto Jarvis" },
      {
        name: "description",
        content:
          "Cria conta ou entra no Cripto Jarvis para guardar a tua carteira simulada e o histórico de operações na cloud.",
      },
      { property: "og:title", content: "Entrar — Cripto Jarvis" },
      {
        property: "og:description",
        content: "Acede ao teu painel de trading simulado com IA.",
      },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/auth" });
  const [mode, setMode] = useState<"entrar" | "registar">("entrar");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const target = search.redirect?.startsWith("/") ? search.redirect : "/dashboard";

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: target, replace: true });
    });
  }, [navigate, target]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    if (mode === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError("Não foi possível entrar. Verifica o email e a palavra-passe.");
      else navigate({ to: target, replace: true });
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { display_name: name || email.split("@")[0] },
        },
      });
      if (error) setError(error.message);
      else if (data.session) navigate({ to: target, replace: true });
      else setInfo("Conta criada. Confirma o email para entrares.");
    }
    setBusy(false);
  };

  const google = async () => {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setError("Não foi possível entrar com Google.");
      return;
    }
    if (result.redirected) return;
    navigate({ to: target, replace: true });
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <Link to="/" className="mb-6 text-center text-xs tracking-widest text-muted-foreground">
        ← VOLTAR
      </Link>
      <div className="hud-panel p-6">
        <h1 className="text-xl text-glow">CRIPTO JARVIS</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {mode === "entrar"
            ? "Entra para aceder à tua carteira e histórico."
            : "Cria conta para guardares tudo na cloud."}
        </p>

        <form onSubmit={submit} className="mt-6 space-y-3">
          {mode === "registar" && (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome"
              className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          )}
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Palavra-passe"
            className="w-full rounded-md border border-border bg-secondary/60 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
          {info && <p className="text-xs text-success">{info}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-primary px-3 py-2 font-display text-xs text-primary-foreground disabled:opacity-50"
          >
            {mode === "entrar" ? "ENTRAR" : "CRIAR CONTA"}
          </button>
        </form>

        <button
          onClick={google}
          className="mt-3 w-full rounded-md border border-border bg-secondary/60 px-3 py-2 font-display text-xs hover:bg-secondary"
        >
          CONTINUAR COM GOOGLE
        </button>

        <button
          onClick={() => setMode(mode === "entrar" ? "registar" : "entrar")}
          className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          {mode === "entrar" ? "Ainda não tens conta? Regista-te" : "Já tens conta? Entra"}
        </button>
      </div>
    </main>
  );
}
