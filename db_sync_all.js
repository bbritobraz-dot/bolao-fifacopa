const SUPABASE_URL = "https://ykrfdfvzcmomlayfvwvm.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrcmZkZnZ6Y21vbWxheWZ2d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzQyODUsImV4cCI6MjA5NzIxMDI4NX0.Z1LLh1SeXy3GfMYhUDGD1_vcmqelMjQ9e1gGNA203VA";

const headers = {
  "apikey": ANON_KEY,
  "Authorization": `Bearer ${ANON_KEY}`,
  "Content-Type": "application/json"
};

const TRANSLATION_MAP = {
  "Mexico": "México", "South Africa": "África do Sul", "South Korea": "Coreia do Sul",
  "Czech Republic": "Tchéquia", "Czechia": "Tchéquia",
  "Canada": "Canadá", "Bosnia and Herzegovina": "Bósnia e Herz.", "Bosnia-Herzegovina": "Bósnia e Herz.", "Bosnia & Herzegovina": "Bósnia e Herz.",
  "Qatar": "Catar", "Switzerland": "Suíça",
  "Brazil": "Brasil", "Morocco": "Marrocos", "Scotland": "Escócia", "Haiti": "Haiti",
  "United States": "EUA", "USA": "EUA", "Paraguay": "Paraguai", "Australia": "Austrália", "Turkey": "Turquia",
  "Germany": "Alemanha", "Curaçao": "Curaçao", "Ivory Coast": "Costa do Marfim", "Ecuador": "Equador",
  "Netherlands": "Holanda", "Japan": "Japão", "Sweden": "Suécia", "Tunisia": "Tunísia",
  "Belgium": "Bélgica", "Egypt": "Egito", "Iran": "Irã", "New Zealand": "Nova Zelândia",
  "Spain": "Espanha", "Cape Verde": "Cabo Verde", "Saudi Arabia": "Arábia Saudita", "Uruguay": "Uruguai",
  "France": "França", "Senegal": "Senegal", "Iraq": "Iraque", "Norway": "Noruega",
  "Argentina": "Argentina", "Algeria": "Argélia", "Austria": "Áustria", "Jordan": "Jordânia",
  "Portugal": "Portugal", "DR Congo": "RD Congo", "Congo DR": "RD Congo", "Democratic Republic of the Congo": "RD Congo",
  "Uzbekistan": "Uzbequistão", "Colombia": "Colômbia",
  "England": "Inglaterra", "Croatia": "Croácia", "Ghana": "Gana", "Panama": "Panamá"
};

function translate(teamName) {
  return TRANSLATION_MAP[teamName] || teamName;
}

function parseAPIDate(dateStr, timeStr) {
  try {
    const timeOnly = timeStr.split(' ')[0]; // "13:00"
    let finalISO = '';
    if (timeStr.includes('-') || timeStr.includes('+')) {
      const offsetIndex = timeStr.indexOf('UTC') + 3;
      const offset = timeStr.substring(offsetIndex).trim(); // "-6"
      const sign = offset.charAt(0);
      const num = offset.substring(1);
      const padded = String(num).padStart(2, '0') + ':00';
      finalISO = `${dateStr}T${timeOnly}:00${sign}${padded}`;
    } else {
      finalISO = `${dateStr}T${timeOnly}:00Z`;
    }
    return new Date(finalISO).toISOString();
  } catch (e) {
    console.error(`Falha ao converter data: ${dateStr} ${timeStr}`, e);
    return new Date(dateStr).toISOString(); // fallback
  }
}

async function runFullSync() {
  console.log("1. Buscando jogos do nosso banco de dados...");
  let localMatches = [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/matches?select=*`, { headers });
    if (!res.ok) throw new Error(res.statusText);
    localMatches = await res.json();
    console.log(`Sucesso! Encontrados ${localMatches.length} jogos locais.`);
  } catch (err) {
    console.error("Erro ao buscar jogos locais:", err);
    return;
  }

  console.log("\n2. Buscando tabela oficial da Copa (openfootball)...");
  let apiMatches = [];
  try {
    const response = await fetch('https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json');
    if (!response.ok) throw new Error(response.statusText);
    const data = await response.json();
    apiMatches = data.matches || [];
    console.log(`Sucesso! Encontrados ${apiMatches.length} jogos na tabela oficial.`);
  } catch (err) {
    console.error("Erro ao buscar jogos da API:", err);
    return;
  }

  console.log("\n3. Sincronizando dados...");
  let dateUpdatesCount = 0;
  let scoreUpdatesCount = 0;

  for (const apiMatch of apiMatches) {
    const homeTranslated = translate(apiMatch.team1);
    const awayTranslated = translate(apiMatch.team2);

    // Encontra o jogo correspondente no nosso banco de dados
    // Fazemos a busca pelos nomes traduzidos das duas seleções na fase de grupos
    const dbMatch = localMatches.find(m => 
      m.stage === 'group' && 
      ((m.home_team === homeTranslated && m.away_team === awayTranslated) ||
       (m.home_team === awayTranslated && m.away_team === homeTranslated))
    );

    if (dbMatch) {
      const correctDate = parseAPIDate(apiMatch.date, apiMatch.time);
      const isSwapped = dbMatch.home_team === awayTranslated && dbMatch.away_team === homeTranslated;

      // Monta objeto de atualização
      const updateData = {};

      // Corrigir data se estiver errada
      if (new Date(dbMatch.match_date).toISOString() !== correctDate) {
        updateData.match_date = correctDate;
      }

      // Se as seleções estiverem invertidas mandante/visitante, corrige no banco
      if (isSwapped) {
        updateData.home_team = homeTranslated;
        updateData.away_team = awayTranslated;
        updateData.home_flag = dbMatch.away_flag;
        updateData.away_flag = dbMatch.home_flag;
      }

      // Sincronizar placares reais se o jogo já terminou
      const hasAPIScore = apiMatch.score && apiMatch.score.ft;
      if (hasAPIScore) {
        const homeScore = isSwapped ? apiMatch.score.ft[1] : apiMatch.score.ft[0];
        const awayScore = isSwapped ? apiMatch.score.ft[0] : apiMatch.score.ft[1];

        // Só atualiza se o placar local estiver diferente ou nulo
        if (dbMatch.home_score !== homeScore || dbMatch.away_score !== awayScore || dbMatch.status !== 'finished') {
          updateData.home_score = homeScore;
          updateData.away_score = awayScore;
          updateData.status = 'finished';
          scoreUpdatesCount++;
        }
      }

      // Se houver qualquer atualização a ser feita
      if (Object.keys(updateData).length > 0) {
        try {
          const patchUrl = `${SUPABASE_URL}/rest/v1/matches?id=eq.${dbMatch.id}`;
          const patchRes = await fetch(patchUrl, {
            method: "PATCH",
            headers,
            body: JSON.stringify(updateData)
          });
          if (!patchRes.ok) throw new Error(patchRes.statusText);
          
          if (updateData.match_date) dateUpdatesCount++;
          console.log(`[ID ${dbMatch.id}] Sincronizado: ${homeTranslated} x ${awayTranslated}` + 
            (updateData.home_score !== undefined ? ` (Placar: ${updateData.home_score}x${updateData.away_score})` : '') +
            (updateData.match_date ? ` (Data corrigida)` : '')
          );
        } catch (e) {
          console.error(`Erro ao atualizar jogo ID ${dbMatch.id}:`, e);
        }
      }
    }
  }

  console.log(`\n=== SINCRONIZAÇÃO COMPLETA ===`);
  console.log(`Datas/Mandantes corrigidos: ${dateUpdatesCount}`);
  console.log(`Placares reais atualizados: ${scoreUpdatesCount}`);
}

runFullSync();
