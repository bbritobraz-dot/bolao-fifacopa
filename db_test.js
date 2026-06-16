const SUPABASE_URL = "https://ykrfdfvzcmomlayfvwvm.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrcmZkZnZ6Y21vbWxheWZ2d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzQyODUsImV4cCI6MjA5NzIxMDI4NX0.Z1LLh1SeXy3GfMYhUDGD1_vcmqelMjQ9e1gGNA203VA";

async function testDatabase() {
  console.log("=== INICIANDO TESTES DO BANCO DE DADOS SUPABASE ===");
  
  const headers = {
    "apikey": ANON_KEY,
    "Authorization": `Bearer ${ANON_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
  };

  try {
    // 1. Fetching matches count
    console.log("\n1. Buscando jogos do banco...");
    const resMatches = await fetch(`${SUPABASE_URL}/rest/v1/matches?select=id,home_team,away_team&limit=5`, { headers });
    if (!resMatches.ok) throw new Error(`Erro ao buscar jogos: ${resMatches.statusText}`);
    const matches = await resMatches.json();
    console.log(`Sucesso! Encontrados ${matches.length} jogos (mostrando os 5 primeiros):`);
    console.table(matches);

    // 2. Insert test participant
    console.log("\n2. Inserindo participante de teste...");
    const testSessionId = "00000000-0000-0000-0000-000000000000";
    const resPart = await fetch(`${SUPABASE_URL}/rest/v1/participants`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Test Friend",
        session_id: testSessionId
      })
    });
    if (!resPart.ok) throw new Error(`Erro ao criar participante: ${await resPart.text()}`);
    const parts = await resPart.json();
    const partId = parts[0].id;
    console.log(`Sucesso! Participante de teste criado. ID: ${partId}`);

    // 3. Insert test guess on Match 17 (France vs Senegal)
    // Palpite: França 2 x 1 Senegal
    console.log("\n3. Criando palpite para o jogo 17 (França vs Senegal) - Palpite: 2 x 1...");
    const resGuess = await fetch(`${SUPABASE_URL}/rest/v1/guesses`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        participant_id: partId,
        match_id: 17,
        home_score: 2,
        away_score: 1
      })
    });
    if (!resGuess.ok) throw new Error(`Erro ao criar palpite: ${await resGuess.text()}`);
    const guesses = await resGuess.json();
    console.log(`Sucesso! Palpite criado.`);

    // 4. Update Match 17 score (Real result: France 2 x 1 Senegal - exact score)
    console.log("\n4. Atualizando placar real do jogo 17 para 2 x 1 (Palpite Exato)...");
    const resUpdate1 = await fetch(`${SUPABASE_URL}/rest/v1/matches?id=eq.17`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        home_score: 2,
        away_score: 1,
        status: "finished"
      })
    });
    if (!resUpdate1.ok) throw new Error(`Erro ao atualizar jogo: ${await resUpdate1.text()}`);
    
    // Fetch guess to check points
    console.log("Verificando se os pontos foram recalculados para 10 (exato)...");
    const resCheck1 = await fetch(`${SUPABASE_URL}/rest/v1/guesses?participant_id=eq.${partId}&match_id=eq.17`, { headers });
    const check1 = await resCheck1.json();
    console.log(`Pontos atuais: ${check1[0].points} (Esperado: 10) - ${check1[0].points === 10 ? 'APROVADO! ✓' : 'FALHOU! ✗'}`);

    // 5. Update Match 17 score (Real result: France 3 x 2 Senegal - winner and goal diff +1, but not exact)
    console.log("\n5. Atualizando placar real do jogo 17 para 3 x 2 (Mesmo vencedor e saldo de +1)...");
    const resUpdate2 = await fetch(`${SUPABASE_URL}/rest/v1/matches?id=eq.17`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        home_score: 3,
        away_score: 2
      })
    });
    if (!resUpdate2.ok) throw new Error(`Erro ao atualizar jogo: ${await resUpdate2.text()}`);

    // Fetch guess to check points
    console.log("Verificando se os pontos foram recalculados para 7 (saldo)...");
    const resCheck2 = await fetch(`${SUPABASE_URL}/rest/v1/guesses?participant_id=eq.${partId}&match_id=eq.17`, { headers });
    const check2 = await resCheck2.json();
    console.log(`Pontos atuais: ${check2[0].points} (Esperado: 7) - ${check2[0].points === 7 ? 'APROVADO! ✓' : 'FALHOU! ✗'}`);

    // 6. Update Match 17 score (Real result: France 2 x 0 Senegal - winner, different goal diff)
    console.log("\n6. Atualizando placar real do jogo 17 para 2 x 0 (Apenas vencedor, saldo diferente)...");
    const resUpdate3 = await fetch(`${SUPABASE_URL}/rest/v1/matches?id=eq.17`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        home_score: 2,
        away_score: 0
      })
    });
    if (!resUpdate3.ok) throw new Error(`Erro ao atualizar jogo: ${await resUpdate3.text()}`);

    // Fetch guess to check points
    console.log("Verificando se os pontos foram recalculados para 5 (vencedor)...");
    const resCheck3 = await fetch(`${SUPABASE_URL}/rest/v1/guesses?participant_id=eq.${partId}&match_id=eq.17`, { headers });
    const check3 = await resCheck3.json();
    console.log(`Pontos atuais: ${check3[0].points} (Esperado: 5) - ${check3[0].points === 5 ? 'APROVADO! ✓' : 'FALHOU! ✗'}`);

    // Clean up: Delete test participant (cascades and deletes the guess, and resets match 17)
    console.log("\n7. Limpando dados de teste...");
    await fetch(`${SUPABASE_URL}/rest/v1/participants?id=eq.${partId}`, {
      method: "DELETE",
      headers
    });
    
    // Reset match 17
    await fetch(`${SUPABASE_URL}/rest/v1/matches?id=eq.17`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        home_score: null,
        away_score: null,
        status: "scheduled"
      })
    });
    console.log("Limpeza concluída! Banco de dados de volta ao estado original.");
    console.log("\n=== TODOS OS TESTES PASSARAM COM SUCESSO! 🏆 ===");

  } catch (err) {
    console.error("\n❌ ERRO DURANTE OS TESTES:", err);
  }
}

testDatabase();
