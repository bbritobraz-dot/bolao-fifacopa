const SUPABASE_URL = "https://ykrfdfvzcmomlayfvwvm.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrcmZkZnZ6Y21vbWxheWZ2d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzQyODUsImV4cCI6MjA5NzIxMDI4NX0.Z1LLh1SeXy3GfMYhUDGD1_vcmqelMjQ9e1gGNA203VA";

async function queryMatches() {
  const headers = {
    "apikey": ANON_KEY,
    "Authorization": `Bearer ${ANON_KEY}`,
    "Content-Type": "application/json"
  };

  try {
    const url = `${SUPABASE_URL}/rest/v1/matches?group_name=in.("Grupo C","Grupo D")&select=id,home_team,away_team,group_name,match_date,status&order=id.asc`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP Error: ${res.statusText}`);
    const data = await res.json();
    console.log("=== JOGOS DO GRUPO C E D NO BANCO ===");
    console.table(data);
  } catch (err) {
    console.error("Erro na busca:", err);
  }
}

queryMatches();
