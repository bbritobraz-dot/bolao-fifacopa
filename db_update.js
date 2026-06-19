const SUPABASE_URL = "https://ykrfdfvzcmomlayfvwvm.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrcmZkZnZ6Y21vbWxheWZ2d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzQyODUsImV4cCI6MjA5NzIxMDI4NX0.Z1LLh1SeXy3GfMYhUDGD1_vcmqelMjQ9e1gGNA203VA";

const headers = {
  "apikey": ANON_KEY,
  "Authorization": `Bearer ${ANON_KEY}`,
  "Content-Type": "application/json"
};

const updates = [
  // Rodada 2 - Hoje (19 de Junho de 2026)
  {
    id: 29,
    body: {
      home_team: "Escócia",
      away_team: "Marrocos",
      home_flag: "gb-sct",
      away_flag: "ma",
      match_date: "2026-06-19 19:00:00-03"
    }
  },
  {
    id: 30,
    body: {
      home_team: "Brasil",
      away_team: "Haiti",
      home_flag: "br",
      away_flag: "ht",
      match_date: "2026-06-19 21:30:00-03"
    }
  },
  {
    id: 31,
    body: {
      home_team: "Turquia",
      away_team: "Paraguai",
      home_flag: "tr",
      away_flag: "py",
      match_date: "2026-06-20 00:00:00-03" // Meia-noite de sexta para sábado no horário de Brasília
    }
  },
  {
    id: 32,
    body: {
      home_team: "EUA",
      away_team: "Austrália",
      home_flag: "us",
      away_flag: "au",
      match_date: "2026-06-19 16:00:00-03"
    }
  },
  
  // Rodada 3 - Swapped Group C Matches (24 de Junho de 2026)
  {
    id: 53,
    body: {
      home_team: "Haiti",
      away_team: "Marrocos",
      home_flag: "ht",
      away_flag: "ma",
      match_date: "2026-06-24 21:00:00-03"
    }
  },
  {
    id: 54,
    body: {
      home_team: "Escócia",
      away_team: "Brasil",
      home_flag: "gb-sct",
      away_flag: "br",
      match_date: "2026-06-24 21:00:00-03"
    }
  }
];

async function runUpdates() {
  console.log("=== INICIANDO ATUALIZAÇÃO DOS JOGOS ===");
  for (const update of updates) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/matches?id=eq.${update.id}`;
      const res = await fetch(url, {
        method: "PATCH",
        headers,
        body: JSON.stringify(update.body)
      });
      if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
      console.log(`Jogo ID ${update.id} atualizado com sucesso! (${update.body.home_team} x ${update.body.away_team})`);
    } catch (err) {
      console.error(`Erro ao atualizar jogo ${update.id}:`, err);
    }
  }
  console.log("=== ATUALIZAÇÕES CONCLUÍDAS ===");
}

runUpdates();
