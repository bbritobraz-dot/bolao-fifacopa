(() => {
// ==========================================================================
// BOLÃO COPA DO MUNDO 2026 - APPLICATION LOGIC
// ==========================================================================

// 1. SUPABASE CLIENT CONFIGURATION
const SUPABASE_URL = "https://ykrfdfvzcmomlayfvwvm.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlrcmZkZnZ6Y21vbWxheWZ2d3ZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MzQyODUsImV4cCI6MjA5NzIxMDI4NX0.Z1LLh1SeXy3GfMYhUDGD1_vcmqelMjQ9e1gGNA203VA";

let supabase = null;

// 2. STATE VARIABLES
let currentUser = null;
let matches = [];
let userGuesses = {}; // Keyed by match_id
let participants = [];
let activeFilter = 'today'; // 'today', 'upcoming', 'finished', 'all'
let activeGroupFilter = 'all'; // 'all', 'Grupo A', etc.
let isAdmin = false;
let onboardingMode = 'login'; // 'login' or 'register'
let inviteCodes = [];
let accessRequests = [];
let adminAccessSubtab = 'requests'; // 'requests' or 'codes'

// Playoff advancement mapping
// Format: { source_bracket_node: { next_match_id, position: 'home' | 'away' } }
const PLAYOFF_MAPPING = {
  'R32_1': { next_id: 89, pos: 'home' },
  'R32_2': { next_id: 89, pos: 'away' },
  'R32_3': { next_id: 90, pos: 'home' },
  'R32_4': { next_id: 90, pos: 'away' },
  'R32_5': { next_id: 91, pos: 'home' },
  'R32_6': { next_id: 91, pos: 'away' },
  'R32_7': { next_id: 92, pos: 'home' },
  'R32_8': { next_id: 92, pos: 'away' },
  'R32_9': { next_id: 93, pos: 'home' },
  'R32_10': { next_id: 93, pos: 'away' },
  'R32_11': { next_id: 94, pos: 'home' },
  'R32_12': { next_id: 94, pos: 'away' },
  'R32_13': { next_id: 95, pos: 'home' },
  'R32_14': { next_id: 95, pos: 'away' },
  'R32_15': { next_id: 96, pos: 'home' },
  'R32_16': { next_id: 96, pos: 'away' },
  
  'R16_1': { next_id: 97, pos: 'home' },
  'R16_2': { next_id: 97, pos: 'away' },
  'R16_3': { next_id: 98, pos: 'home' },
  'R16_4': { next_id: 98, pos: 'away' },
  'R16_5': { next_id: 99, pos: 'home' },
  'R16_6': { next_id: 99, pos: 'away' },
  'R16_7': { next_id: 100, pos: 'home' },
  'R16_8': { next_id: 100, pos: 'away' },
  
  'QF1': { next_id: 101, pos: 'home' },
  'QF2': { next_id: 101, pos: 'away' },
  'QF3': { next_id: 102, pos: 'home' },
  'QF4': { next_id: 102, pos: 'away' },
  
  'SF1': { next_id: 104, pos: 'home', loser_id: 103, loser_pos: 'home' },
  'SF2': { next_id: 104, pos: 'away', loser_id: 103, loser_pos: 'away' }
};

// 3. INITIALIZATION & SESSION HANDLING
async function initApp() {
  try {
    if (typeof window.supabase === 'undefined') {
      throw new Error("A biblioteca Supabase não carregou. Verifique sua conexão com a internet ou adblockers.");
    }
    
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    setupTabs();
    setupEventListeners();
    await handleSession();
    setupRealtimeSubscription();
  } catch (err) {
    console.error("Erro de Inicialização:", err);
    const loaderText = document.querySelector('#loading-screen p');
    if (loaderText) {
      loaderText.innerHTML = `
        <span style="color: #ef4444; font-weight: 700; font-size: 1.1rem;">Erro ao Conectar</span><br>
        <span style="color: #9ca3af; font-size: 0.85rem; display: block; margin-top: 0.5rem;">${err.message}</span>
        <button onclick="window.location.reload()" class="btn-secondary btn-sm mt-3" style="display:inline-block;">Tentar Novamente ↺</button>
      `;
    }
    const spinner = document.querySelector('#loading-screen .spinner');
    if (spinner) {
      spinner.style.borderLeftColor = '#ef4444';
      spinner.style.animationPlayState = 'paused';
    }
  }
}

function setupRealtimeSubscription() {
  if (!supabase) return;
  supabase
    .channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, async (payload) => {
      console.log("Realtime Match Update:", payload);
      await fetchMatches();
      refreshActiveTab();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'guesses' }, async (payload) => {
      console.log("Realtime Guess Update:", payload);
      await fetchGuesses();
      await fetchRanking();
      refreshActiveTab();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'participants' }, async (payload) => {
      console.log("Realtime Participant Update:", payload);
      await fetchRanking();
      refreshActiveTab();
    })
    .subscribe();
}

function refreshActiveTab() {
  const activeBtn = document.querySelector('.tab-btn.active');
  if (!activeBtn) return;
  const tabId = activeBtn.getAttribute('data-tab');
  if (tabId === 'tab-games') renderGames();
  else if (tabId === 'tab-bracket') renderBracket();
  else if (tabId === 'tab-groups') renderGroups();
  else if (tabId === 'tab-ranking') renderRankingTable();
}

// Initialise immediately if DOM is already ready, otherwise wait for event
if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Setup tab buttons toggling
function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const contentElement = document.getElementById(tabId);
      if (contentElement) contentElement.classList.add('active');

      // Refresh data on specific tab opens
      if (tabId === 'tab-ranking') {
        fetchRanking();
      } else if (tabId === 'tab-games') {
        renderGames();
      } else if (tabId === 'tab-bracket') {
        renderBracket();
      } else if (tabId === 'tab-groups') {
        renderGroups();
      } else if (tabId === 'tab-admin' && isAdmin) {
        renderAdminMatches();
      }
    });
  });
}

// Session checking logic
async function handleSession() {
  showLoading(true);
  const localSessionId = localStorage.getItem('bolao_session_id');
  
  if (localSessionId) {
    try {
      const { data, error } = await supabase
        .from('participants')
        .select('*')
        .eq('session_id', localSessionId)
        .maybeSingle();

      if (data) {
        currentUser = data;
        document.getElementById('user-display-name').textContent = currentUser.name;
        document.getElementById('profile-card').classList.remove('hidden');
        document.getElementById('onboarding-modal').classList.add('hidden');
        
        // Load initial app data
        await refreshAllData();
      } else {
        // Clear corrupt or deleted session
        localStorage.removeItem('bolao_session_id');
        showOnboardingModal();
      }
    } catch (err) {
      console.error("Erro ao verificar sessão:", err);
      showOnboardingModal();
    }
  } else {
    showOnboardingModal();
  }
  showLoading(false);
}

function showOnboardingModal() {
  document.getElementById('onboarding-modal').classList.remove('hidden');
  document.getElementById('profile-card').classList.add('hidden');
}

// 4. EVENT LISTENERS SETUP
function setupEventListeners() {
  // Onboarding Tabs
  document.getElementById('tab-login-btn').addEventListener('click', () => {
    onboardingMode = 'login';
    document.getElementById('tab-login-btn').classList.add('active');
    document.getElementById('tab-register-btn').classList.remove('active');
    document.getElementById('tab-login-btn').style.background = 'rgba(14, 41, 32, 0.8)';
    document.getElementById('tab-login-btn').style.color = '#39ff14';
    document.getElementById('tab-login-btn').style.border = '1px solid rgba(57, 255, 20, 0.2)';
    document.getElementById('tab-register-btn').style.background = 'transparent';
    document.getElementById('tab-register-btn').style.color = '#9ca3af';
    document.getElementById('tab-register-btn').style.border = 'none';
    
    document.getElementById('onboarding-title').textContent = 'Entrar no Bolão';
    document.getElementById('onboarding-desc').textContent = 'Acesse sua conta para palpitar nos jogos da Copa.';
    document.getElementById('join-btn').textContent = 'Entrar no Bolão';
    document.getElementById('onboarding-error').classList.add('hidden');
    
    // Hide invite code controls
    document.getElementById('invite-code-input').classList.add('hidden');
    document.getElementById('request-access-container').classList.add('hidden');
  });

  document.getElementById('tab-register-btn').addEventListener('click', () => {
    onboardingMode = 'register';
    document.getElementById('tab-register-btn').classList.add('active');
    document.getElementById('tab-login-btn').classList.remove('active');
    document.getElementById('tab-register-btn').style.background = 'rgba(14, 41, 32, 0.8)';
    document.getElementById('tab-register-btn').style.color = '#39ff14';
    document.getElementById('tab-register-btn').style.border = '1px solid rgba(57, 255, 20, 0.2)';
    document.getElementById('tab-login-btn').style.background = 'transparent';
    document.getElementById('tab-login-btn').style.color = '#9ca3af';
    document.getElementById('tab-login-btn').style.border = 'none';
    
    document.getElementById('onboarding-title').textContent = 'Primeiro Acesso';
    document.getElementById('onboarding-desc').textContent = 'Crie seu cadastro (usuário e senha) para participar!';
    document.getElementById('join-btn').textContent = 'Cadastrar com Código';
    document.getElementById('onboarding-error').classList.add('hidden');
    
    // Show invite code controls
    document.getElementById('invite-code-input').classList.remove('hidden');
    document.getElementById('request-access-container').classList.remove('hidden');
  });

  // Onboarding Join
  document.getElementById('join-btn').addEventListener('click', handleJoinOrRegister);
  document.getElementById('username-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleJoinOrRegister();
  });
  document.getElementById('password-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleJoinOrRegister();
  });
  document.getElementById('invite-code-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleJoinOrRegister();
  });

  // Request Access Code Button
  document.getElementById('request-code-btn').addEventListener('click', handleRequestAccessCode);

  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('bolao_session_id');
      currentUser = null;
      userGuesses = {};
      document.getElementById('profile-card').classList.add('hidden');
      showOnboardingModal();
    });
  }

  // Calendar Filters
  const filterBtns = document.querySelectorAll('.calendar-filters .filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.getAttribute('data-filter');
      renderGames();
    });
  });

  // Group Select Filter
  document.getElementById('group-filter-select').addEventListener('change', (e) => {
    activeGroupFilter = e.target.value;
    renderGames();
  });

  // Admin Authentication
  document.getElementById('admin-login-btn').addEventListener('click', handleAdminLogin);
  document.getElementById('admin-passcode-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAdminLogin();
  });

  // Admin Logout
  document.getElementById('admin-logout-btn').addEventListener('click', () => {
    isAdmin = false;
    document.getElementById('admin-dashboard-section').classList.add('hidden');
    document.getElementById('admin-auth-section').classList.remove('hidden');
    document.getElementById('admin-passcode-input').value = '';
  });

  // Admin Filter & Search
  document.getElementById('admin-stage-select').addEventListener('change', renderAdminMatches);
  document.getElementById('admin-search-input').addEventListener('input', renderAdminMatches);

  // Admin Sync via API
  document.getElementById('admin-sync-api-btn').addEventListener('click', syncOfficialResultsFromAPI);

  // Admin Invite/Request Sub-tabs
  document.getElementById('admin-view-requests-btn').addEventListener('click', () => {
    adminAccessSubtab = 'requests';
    document.getElementById('admin-view-requests-btn').classList.add('active-admin-subtab');
    document.getElementById('admin-view-codes-btn').classList.remove('active-admin-subtab');
    renderAdminAccessSection();
  });

  document.getElementById('admin-view-codes-btn').addEventListener('click', () => {
    adminAccessSubtab = 'codes';
    document.getElementById('admin-view-codes-btn').classList.add('active-admin-subtab');
    document.getElementById('admin-view-requests-btn').classList.remove('active-admin-subtab');
    renderAdminAccessSection();
  });

  document.getElementById('admin-gen-manual-code-btn').addEventListener('click', handleAdminGenerateManualCode);

  // Danger Zone: Reset placares
  document.getElementById('reset-all-matches-btn').addEventListener('click', handleDangerReset);

  // Close Audit Modal
  document.getElementById('close-audit-modal-btn').addEventListener('click', () => {
    document.getElementById('audit-modal').classList.add('hidden');
  });

  // Close Player Audit Modal
  document.getElementById('close-audit-player-modal-btn').addEventListener('click', () => {
    document.getElementById('audit-player-modal').classList.add('hidden');
  });
}

// 5. ONBOARDING & AUTH ACTIONS
async function handleJoinOrRegister() {
  const nameInput = document.getElementById('username-input').value.trim();
  const passwordInput = document.getElementById('password-input').value.trim();
  const errorMsg = document.getElementById('onboarding-error');

  if (!nameInput) {
    showError(errorMsg, "Por favor, digite seu nome.");
    return;
  }
  if (nameInput.length < 3) {
    showError(errorMsg, "O nome deve ter pelo menos 3 caracteres.");
    return;
  }
  if (!passwordInput) {
    showError(errorMsg, "Por favor, digite sua senha.");
    return;
  }
  if (passwordInput.length < 4) {
    showError(errorMsg, "A senha deve ter pelo menos 4 caracteres.");
    return;
  }

  showLoading(true);
  try {
    if (onboardingMode === 'register') {
      // 1. REGISTER FLOW
      // Verify invite code first
      const inviteCodeInput = document.getElementById('invite-code-input').value.trim().toUpperCase();
      if (!inviteCodeInput) {
        showError(errorMsg, "Por favor, digite o código de acesso fornecido pelo administrador.");
        showLoading(false);
        return;
      }

      const activeCodes = await getAccessConfig('invite_codes', []);
      const codeIndex = activeCodes.indexOf(inviteCodeInput);
      if (codeIndex === -1) {
        showError(errorMsg, "Código de acesso inválido ou já utilizado!");
        showLoading(false);
        return;
      }

      // Check if name already exists
      const { data: existing, error: checkError } = await supabase
        .from('participants')
        .select('id')
        .ilike('name', nameInput)
        .maybeSingle();

      if (existing) {
        showError(errorMsg, "Este nome já está cadastrado. Se já tem uma conta, faça Login.");
        showLoading(false);
        return;
      }

      // Generate session UUID
      const sessionUuid = generateUUID();

      // Insert participant
      const { data: newParticipant, error: insertError } = await supabase
        .from('participants')
        .insert({
          name: nameInput,
          password: passwordInput,
          session_id: sessionUuid
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Consume the code
      activeCodes.splice(codeIndex, 1);
      await saveAccessConfig('invite_codes', activeCodes);

      // Mark request as used if it exists
      const requests = await getAccessConfig('access_requests', []);
      const req = requests.find(r => r.invite_code === inviteCodeInput);
      if (req) {
        req.status = 'registered';
        await saveAccessConfig('access_requests', requests);
      }

      currentUser = newParticipant;
      localStorage.setItem('bolao_session_id', currentUser.session_id);
      
      // Clean up invite code input
      document.getElementById('invite-code-input').value = '';
      
      await loginSuccessful();
    } else {
      // 2. LOGIN FLOW
      const { data: user, error: loginError } = await supabase
        .from('participants')
        .select('*')
        .ilike('name', nameInput)
        .maybeSingle();

      if (!user) {
        showError(errorMsg, "Nome não encontrado. Se é o seu primeiro acesso, clique em 'Primeiro Acesso'.");
        showLoading(false);
        return;
      }

      if (user.password !== passwordInput) {
        showError(errorMsg, "Senha incorreta!");
        showLoading(false);
        return;
      }

      currentUser = user;
      localStorage.setItem('bolao_session_id', currentUser.session_id);
      
      await loginSuccessful();
    }
  } catch (err) {
    console.error("Erro no onboarding:", err);
    showError(errorMsg, "Erro ao processar requisição. Tente novamente.");
  }
  showLoading(false);
}

async function loginSuccessful() {
  document.getElementById('user-display-name').textContent = currentUser.name;
  document.getElementById('profile-card').classList.remove('hidden');
  document.getElementById('onboarding-modal').classList.add('hidden');
  document.getElementById('username-input').value = '';
  document.getElementById('password-input').value = '';
  
  await refreshAllData();
}

async function handleAdminLogin() {
  const passcode = document.getElementById('admin-passcode-input').value;
  const errorMsg = document.getElementById('admin-auth-error');

  showLoading(true);
  try {
    const { data, error } = await supabase
      .from('config')
      .select('value')
      .eq('key', 'admin_passcode')
      .single();

    if (data && data.value === passcode) {
      isAdmin = true;
      errorMsg.classList.add('hidden');
      document.getElementById('admin-auth-section').classList.add('hidden');
      document.getElementById('admin-dashboard-section').classList.remove('hidden');
      await renderAdminMatches();
      await renderAdminAccessSection();
    } else {
      showError(errorMsg, "Senha de admin incorreta!");
    }
  } catch (err) {
    console.error("Erro na autenticação:", err);
    showError(errorMsg, "Falha de conexão.");
  }
  showLoading(false);
}

async function syncOfficialResultsFromAPI() {
  showLoading(true);
  try {
    const response = await fetch('https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json');
    if (!response.ok) throw new Error("Não foi possível acessar a API de resultados públicos.");
    const data = await response.json();
    const apiMatches = data.matches || [];

    const TRANSLATION_MAP = {
      "Mexico": "México", "South Africa": "África do Sul", "South Korea": "Coreia do Sul", "Czech Republic": "Tchéquia", "Czechia": "Tchéquia",
      "Canada": "Canadá", "Bosnia and Herzegovina": "Bósnia e Herz.", "Bosnia-Herzegovina": "Bósnia e Herz.", "Bosnia & Herzegovina": "Bósnia e Herz.", "Qatar": "Catar", "Switzerland": "Suíça",
      "Brazil": "Brasil", "Morocco": "Marrocos", "Scotland": "Escócia", "Haiti": "Haiti",
      "United States": "EUA", "USA": "EUA", "Paraguay": "Paraguai", "Australia": "Austrália", "Turkey": "Turquia",
      "Germany": "Alemanha", "Curaçao": "Curaçao", "Ivory Coast": "Costa do Marfim", "Ecuador": "Equador",
      "Netherlands": "Holanda", "Japan": "Japão", "Sweden": "Suécia", "Tunisia": "Tunísia",
      "Belgium": "Bélgica", "Egypt": "Egito", "Iran": "Irã", "New Zealand": "Nova Zelândia",
      "Spain": "Espanha", "Cape Verde": "Cabo Verde", "Saudi Arabia": "Arábia Saudita", "Uruguay": "Uruguai",
      "France": "França", "Senegal": "Senegal", "Iraq": "Iraque", "Norway": "Noruega",
      "Argentina": "Argentina", "Algeria": "Argélia", "Austria": "Áustria", "Jordan": "Jordânia",
      "Portugal": "Portugal", "DR Congo": "RD Congo", "Congo DR": "RD Congo", "Democratic Republic of the Congo": "RD Congo", "Uzbekistan": "Uzbequistão", "Colombia": "Colômbia",
      "England": "Inglaterra", "Croatia": "Croácia", "Ghana": "Gana", "Panama": "Panamá"
    };

    function translate(teamName) {
      return TRANSLATION_MAP[teamName] || teamName;
    }

    let updatedCount = 0;

    for (const apiMatch of apiMatches) {
      if (apiMatch.score && apiMatch.score.ft) {
        const homeTranslated = translate(apiMatch.team1);
        const awayTranslated = translate(apiMatch.team2);

        // Find the match in our database matches list (Fase de grupos)
        // Match home/away either way to handle potential swaps
        const dbMatch = matches.find(m => 
          m.stage === 'group' && 
          ((m.home_team === homeTranslated && m.away_team === awayTranslated) ||
           (m.home_team === awayTranslated && m.away_team === homeTranslated))
        );

        if (dbMatch) {
          const isSwapped = dbMatch.home_team === awayTranslated && dbMatch.away_team === homeTranslated;
          const homeScore = isSwapped ? apiMatch.score.ft[1] : apiMatch.score.ft[0];
          const awayScore = isSwapped ? apiMatch.score.ft[0] : apiMatch.score.ft[1];

          const needsScoreUpdate = dbMatch.home_score !== homeScore || dbMatch.away_score !== awayScore || dbMatch.status !== 'finished';
          const needsTeamSwap = isSwapped;

          if (needsScoreUpdate || needsTeamSwap) {
            const updateObj = {
              status: 'finished'
            };

            if (needsScoreUpdate) {
              updateObj.home_score = homeScore;
              updateObj.away_score = awayScore;
            }

            if (needsTeamSwap) {
              updateObj.home_team = homeTranslated;
              updateObj.away_team = awayTranslated;
              updateObj.home_flag = dbMatch.away_flag;
              updateObj.away_flag = dbMatch.home_flag;
            }

            const { error } = await supabase
              .from('matches')
              .update(updateObj)
              .eq('id', dbMatch.id);

            if (!error) {
              updatedCount++;
            } else {
              console.error(`Erro ao atualizar jogo ${dbMatch.id}:`, error);
            }
          }
        }
      }
    }

    alert(`Sincronização concluída! ${updatedCount} jogos foram atualizados com novos placares.`);
    await refreshAllData();
    if (isAdmin) renderAdminMatches();
  } catch (err) {
    console.error("Erro na sincronização:", err);
    alert(`Falha ao sincronizar: ${err.message}`);
  }
  showLoading(false);
}

// 6. FETCHING DATA
async function refreshAllData() {
  await fetchMatches();
  await fetchGuesses();
  await fetchRanking();
  
  // Calculate and display user points
  if (currentUser) {
    const userRankData = participants.find(p => p.id === currentUser.id);
    if (userRankData) {
      document.getElementById('user-display-points').textContent = `${userRankData.points} pts`;
    }
  }
}

async function fetchMatches() {
  const { data, error } = await supabase
    .from('matches')
    .select('*')
    .order('match_date', { ascending: true })
    .order('id', { ascending: true });

  if (error) console.error("Erro ao buscar jogos:", error);
  else matches = data || [];
}

async function fetchGuesses() {
  if (!currentUser) return;
  
  const { data, error } = await supabase
    .from('guesses')
    .select('*')
    .eq('participant_id', currentUser.id);

  if (error) {
    console.error("Erro ao buscar palpites:", error);
  } else {
    userGuesses = {};
    (data || []).forEach(g => {
      // Recalcular pontos client-side sob as novas regras
      const match = matches.find(m => m.id === g.match_id);
      let pts = 0;
      if (match && match.status === 'finished' && match.home_score !== null && match.away_score !== null) {
        if (g.home_score === match.home_score && g.away_score === match.away_score) {
          pts = 10;
        } else if (match.home_score !== match.away_score &&
                   (g.home_score - g.away_score) === (match.home_score - match.away_score) &&
                   Math.sign(g.home_score - g.away_score) === Math.sign(match.home_score - match.away_score)) {
          pts = 5;
        } else if (Math.sign(g.home_score - g.away_score) === Math.sign(match.home_score - match.away_score)) {
          pts = 3;
        }
      }
      g.points = pts;
      userGuesses[g.match_id] = g;
    });
  }
}

async function fetchRanking() {
  try {
    // Fetch all participants with their guesses joined
    const { data, error } = await supabase
      .from('participants')
      .select(`
        id,
        name,
        guesses (
          match_id,
          home_score,
          away_score
        )
      `);

    if (error) throw error;

    // Calculate details for ranking using client-side points logic (10, 5, 3)
    participants = (data || []).map(p => {
      const gList = p.guesses || [];
      let totalPoints = 0;
      let exacts = 0;
      let diffs = 0;
      let wins = 0;

      gList.forEach(g => {
        const match = matches.find(m => m.id === g.match_id);
        if (match && match.status === 'finished' && match.home_score !== null && match.away_score !== null) {
          let pts = 0;
          if (g.home_score === match.home_score && g.away_score === match.away_score) {
            pts = 10;
            exacts++;
          } else if (match.home_score !== match.away_score &&
                     (g.home_score - g.away_score) === (match.home_score - match.away_score) &&
                     Math.sign(g.home_score - g.away_score) === Math.sign(match.home_score - match.away_score)) {
            pts = 5;
            diffs++;
          } else if (Math.sign(g.home_score - g.away_score) === Math.sign(match.home_score - match.away_score)) {
            pts = 3;
            wins++;
          }
          totalPoints += pts;
        }
      });

      return {
        id: p.id,
        name: p.name,
        points: totalPoints,
        exacts: exacts,
        diffs: diffs,
        wins: wins
      };
    });

    // Sort: 1. Points DESC, 2. Exacts DESC, 3. Diffs DESC, 4. Name ASC
    participants.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.exacts !== a.exacts) return b.exacts - a.exacts;
      if (b.diffs !== a.diffs) return b.diffs - a.diffs;
      return a.name.localeCompare(b.name);
    });

    renderRankingTable();
  } catch (err) {
    console.error("Erro ao calcular ranking:", err);
  }
}

// 7. RENDER FUNCTIONS

// Render Ranking Table
function renderRankingTable() {
  // Update prize pool values dynamically (R$ 10 per participant)
  const count = participants.length;
  const totalPrize = count * 10;
  
  const countEl = document.getElementById('participants-count-prize');
  const totalEl = document.getElementById('prize-total-value');
  const firstEl = document.getElementById('prize-1st-value');
  const secondEl = document.getElementById('prize-2nd-value');

  if (countEl) countEl.textContent = count;
  if (totalEl) totalEl.textContent = `R$ ${totalPrize.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (firstEl) firstEl.textContent = `R$ ${(totalPrize * 0.7).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (secondEl) secondEl.textContent = `R$ ${(totalPrize * 0.3).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const rankingList = document.getElementById('ranking-list');
  rankingList.innerHTML = '';

  if (participants.length === 0) {
    rankingList.innerHTML = '<tr><td colspan="6" class="text-center text-secondary">Nenhum participante ainda.</td></tr>';
    return;
  }

  participants.forEach((p, idx) => {
    const tr = document.createElement('tr');
    
    // Highlight logged user
    if (currentUser && p.id === currentUser.id) {
      tr.classList.add('ranking-self');
    }

    const position = idx + 1;
    const total = participants.length;
    const isLastTwo = total >= 2 && position > (total - 2);
    
    // Add classification zone classes for fun: G4 Lib, G4 Sula (5-8), Z4 Rebaixamento
    if (total >= 4) {
      // Rebaixamento (últimos 4)
      const isRebaixamento = position > (total - 4);

      // Libertadores (G4 - top 4)
      const isLibertadores = !isRebaixamento && position <= 4;

      // Sul-Americana (posições 5 a 8)
      const isSulAmericana = !isRebaixamento && !isLibertadores && position >= 5 && position <= 8;

      if (isLibertadores) {
        tr.classList.add('zone-libertadores');
      } else if (isSulAmericana) {
        tr.classList.add('zone-sulamericana');
      } else if (isRebaixamento) {
        tr.classList.add('zone-rebaixamento');
      }
    }

    let rankBadgeClass = '';
    if (position === 1) rankBadgeClass = 'rank-1';
    else if (position === 2) rankBadgeClass = 'rank-2';
    else if (position === 3) rankBadgeClass = 'rank-3';

    tr.innerHTML = `
      <td class="col-pos">
        <span class="rank-number ${rankBadgeClass}">${position}</span>
      </td>
      <td>
        <div class="cell-name-container">
          <span>${escapeHTML(p.name)}</span>
          ${isLastTwo ? '<span class="duck-animated" title="Quack! Lanterna do bolão 🦆">🦆</span>' : ''}
          ${(currentUser && p.id === currentUser.id) ? '<span class="badge-self-indicator">Você</span>' : ''}
          <button class="btn-audit-player" data-player-id="${p.id}" data-player-name="${escapeHTML(p.name)}" title="Auditar palpites de ${escapeHTML(p.name)}">👁️</button>
        </div>
      </td>
      <td class="col-exact">${p.exacts}</td>
      <td class="col-diff">${p.diffs}</td>
      <td class="col-win">${p.wins}</td>
      <td class="col-pts"><span class="points-total">${p.points}</span></td>
    `;
    rankingList.appendChild(tr);
  });

  // Render classification legend dynamically
  const legendContainer = document.getElementById('ranking-legend-container');
  if (legendContainer) {
    if (participants.length >= 4) {
      legendContainer.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <span style="display: inline-block; width: 8px; height: 8px; background-color: #3b82f6; border-radius: 2px;"></span>
          <span>Libertadores</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <span style="display: inline-block; width: 8px; height: 8px; background-color: #f97316; border-radius: 2px;"></span>
          <span>Sul-Americana</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.35rem;">
          <span style="display: inline-block; width: 8px; height: 8px; background-color: #ef4444; border-radius: 2px;"></span>
          <span>Rebaixamento</span>
        </div>
      `;
      legendContainer.classList.remove('hidden');
    } else {
      legendContainer.innerHTML = '';
      legendContainer.classList.add('hidden');
    }
  }

  // Attach event listeners to player audit buttons
  const playerAuditBtns = rankingList.querySelectorAll('.btn-audit-player');
  playerAuditBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const playerId = btn.getAttribute('data-player-id');
      const playerName = btn.getAttribute('data-player-name');
      openPlayerAuditModal(playerId, playerName);
    });
  });
}

// Render Games Grid
function renderGames() {
  const gamesList = document.getElementById('games-list');
  gamesList.innerHTML = '';

  const clientTodayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local

  const filteredMatches = matches.filter(match => {
    // Only group stage games
    if (match.stage !== 'group') return false;

    // Only starting from today's games (local date)
    const matchLocalDateStr = new Date(match.match_date).toLocaleDateString('en-CA');
    if (matchLocalDateStr < clientTodayStr) return false;

    // 1. Group Filter
    if (activeGroupFilter !== 'all') {
      if (match.group_name !== activeGroupFilter) return false;
    }

    // 2. Calendar Filter (Today, Upcoming, Finished)
    const isFinished = match.status === 'finished';

    if (activeFilter === 'today') {
      return matchLocalDateStr === clientTodayStr;
    } else if (activeFilter === 'upcoming') {
      return !isFinished && matchLocalDateStr >= clientTodayStr;
    } else if (activeFilter === 'finished') {
      return isFinished;
    }
    return true; // 'all'
  });

  if (filteredMatches.length === 0) {
    let emptyMsg = "Nenhum jogo encontrado para estes filtros.";
    if (activeFilter === 'today') emptyMsg = "Não há jogos agendados para hoje (" + formatDateBR(new Date()) + ").";
    
    gamesList.innerHTML = `<div class="text-center text-secondary py-5" style="grid-column: 1/-1; padding: 3rem 0;">${emptyMsg}</div>`;
    return;
  }

  filteredMatches.forEach(match => {
    const isLocked = new Date(match.match_date) <= new Date();
    const guess = userGuesses[match.id] || null;
    const hasGuess = guess !== null;

    const card = document.createElement('div');
    card.className = 'game-card glass';

    // Status / Points Badge
    let cardFooterHTML = '';
    if (match.status === 'finished' && match.home_score !== null && match.away_score !== null) {
      const pts = hasGuess ? guess.points : 0;
      let ptsClass = 'points-0';
      if (pts === 10) ptsClass = 'points-10';
      else if (pts === 5) ptsClass = 'points-5';
      else if (pts === 3) ptsClass = 'points-3';

      cardFooterHTML = `
        <div class="card-footer">
          <span class="badge-status finished">Encerrado</span>
          <span class="badge-points ${ptsClass}">${hasGuess ? `+${pts} pts` : 'Sem palpite'}</span>
        </div>
      `;
    } else {
      cardFooterHTML = `
        <div class="card-footer">
          ${isLocked ? 
            `<span class="badge-status ongoing">Em andamento</span>
             <span class="locked-indicator">🔒 Fechado</span>` : 
            `<span class="badge-status scheduled">Aberto</span>
             <span class="locked-indicator text-secondary">⏳ Palpitar</span>`
          }
        </div>
      `;
    }

    // Flag images
    const homeFlagUrl = `https://flagcdn.com/${match.home_flag}.svg`;
    const awayFlagUrl = `https://flagcdn.com/${match.away_flag}.svg`;

    const guessBoxHeader = isLocked ? 
      `<div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 0.4rem;">
         <span class="guess-box-title">Seu palpite</span>
         <button class="btn-audit" data-match-id="${match.id}" style="background: rgba(57, 255, 20, 0.15); border: 1px solid rgba(57, 255, 20, 0.3); color: var(--color-accent); font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: var(--border-radius-sm); cursor: pointer; font-weight: 600; font-family: Outfit, sans-serif; transition: all var(--transition-fast);">Auditar 👁</button>
       </div>` :
      `<span class="guess-box-title">Seu palpite</span>`;

    card.innerHTML = `
      <div class="game-meta">
        <span class="game-group">${match.group_name}</span>
        <span class="game-time">${formatDateBR(new Date(match.match_date))}</span>
      </div>
      <div class="game-teams">
        <div class="team-row">
          <div class="team-info">
            <img src="${homeFlagUrl}" alt="${match.home_team}" class="flag" onerror="this.src='https://flagcdn.com/un.svg'">
            <span>${match.home_team}</span>
          </div>
          <span class="score-display ${match.status === 'finished' ? 'actual-score' : ''}">
            ${match.home_score !== null ? match.home_score : '-'}
          </span>
        </div>
        <div class="team-row">
          <div class="team-info">
            <img src="${awayFlagUrl}" alt="${match.away_team}" class="flag" onerror="this.src='https://flagcdn.com/un.svg'">
            <span>${match.away_team}</span>
          </div>
          <span class="score-display ${match.status === 'finished' ? 'actual-score' : ''}">
            ${match.away_score !== null ? match.away_score : '-'}
          </span>
        </div>
      </div>
      
      <!-- GUESS BOX -->
      <div class="guess-box">
        ${guessBoxHeader}
        <div class="guess-inputs-row">
          <input type="text" class="guess-score-input" id="g-home-${match.id}" 
            value="${hasGuess ? guess.home_score : ''}" 
            pattern="[0-9]*" inputmode="numeric" maxlength="2"
            ${isLocked ? 'disabled' : ''} 
            data-match-id="${match.id}" data-side="home">
          <span class="guess-divider">x</span>
          <input type="text" class="guess-score-input" id="g-away-${match.id}" 
            value="${hasGuess ? guess.away_score : ''}" 
            pattern="[0-9]*" inputmode="numeric" maxlength="2"
            ${isLocked ? 'disabled' : ''} 
            data-match-id="${match.id}" data-side="away">
        </div>
      </div>
      <div class="guess-saved-indicator" id="saved-${match.id}">Salvo! ✓</div>
      ${cardFooterHTML}
    `;

    gamesList.appendChild(card);
  });

  // Attach auto-save inputs logic
  setupGuessInputHandlers();
  
  // Attach audit click handlers
  setupAuditButtonsHandlers();
}

// Attach auto-save to game prediction inputs (on blur / leave focus)
function setupGuessInputHandlers() {
  const inputs = document.querySelectorAll('.guess-score-input');
  inputs.forEach(input => {
    // Only allow digits
    input.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });

    input.addEventListener('blur', async (e) => {
      const matchId = parseInt(e.target.getAttribute('data-match-id'));
      await saveGuess(matchId);
    });
  });
}

// Auto-saving prediction
async function saveGuess(matchId) {
  if (!currentUser) return;
  
  const homeVal = document.getElementById(`g-home-${matchId}`).value.trim();
  const awayVal = document.getElementById(`g-away-${matchId}`).value.trim();

  // If one of them is empty, do not save yet (wait for both)
  if (homeVal === '' || awayVal === '') return;

  const homeScore = parseInt(homeVal);
  const awayScore = parseInt(awayVal);

  const match = matches.find(m => m.id === matchId);
  if (!match) return;

  // Double check locking on client
  const isLocked = new Date(match.match_date) <= new Date();
  if (isLocked) return;

  // Optimistic updates in local state
  if (!userGuesses[matchId]) {
    userGuesses[matchId] = {
      participant_id: currentUser.id,
      match_id: matchId,
      home_score: homeScore,
      away_score: awayScore
    };
  } else {
    userGuesses[matchId].home_score = homeScore;
    userGuesses[matchId].away_score = awayScore;
  }

  try {
    const { error } = await supabase
      .from('guesses')
      .upsert({
        participant_id: currentUser.id,
        match_id: matchId,
        home_score: homeScore,
        away_score: awayScore
      }, { onConflict: 'participant_id, match_id' });

    if (error) throw error;

    // Show small "Salvo!" animation feedback
    const savedIndicator = document.getElementById(`saved-${matchId}`);
    if (savedIndicator) {
      savedIndicator.classList.add('show');
      setTimeout(() => {
        savedIndicator.classList.remove('show');
      }, 1500);
    }
  } catch (err) {
    console.error("Erro ao salvar palpite:", err);
  }
}

// Render Bracket Tab
function renderBracket() {
  const rounds = {
    'R32': document.getElementById('nodes-r32'),
    'R16': document.getElementById('nodes-r16'),
    'QF': document.getElementById('nodes-qf'),
    'SF': document.getElementById('nodes-sf'),
    'finals': document.getElementById('nodes-finals')
  };

  // Reset containers
  Object.keys(rounds).forEach(k => { rounds[k].innerHTML = ''; });

  const playoffMatches = matches.filter(m => m.stage === 'playoff');

  playoffMatches.forEach(match => {
    const node = match.bracket_node;
    if (!node) return;

    let targetContainer = null;
    if (node.startsWith('R32_')) targetContainer = rounds['R32'];
    else if (node.startsWith('R16_')) targetContainer = rounds['R16'];
    else if (node.startsWith('QF')) targetContainer = rounds['QF'];
    else if (node.startsWith('SF')) targetContainer = rounds['SF'];
    else if (node === 'F' || node === 'T3') targetContainer = rounds['finals'];

    if (!targetContainer) return;

    const matchEl = document.createElement('div');
    matchEl.className = 'bracket-match glass';

    const homeFlagUrl = `https://flagcdn.com/${match.home_flag}.svg`;
    const awayFlagUrl = `https://flagcdn.com/${match.away_flag}.svg`;

    const isFinished = match.status === 'finished' && match.home_score !== null && match.away_score !== null;
    
    let homeWinnerClass = '';
    let awayWinnerClass = '';
    if (isFinished) {
      if (match.home_score > match.away_score) homeWinnerClass = 'winner';
      else if (match.away_score > match.home_score) awayWinnerClass = 'winner';
    }

    const isHomePlaceholder = match.home_team.includes('Grupo') || match.home_team.startsWith('Venc.') || match.home_team.startsWith('Perdedor');
    const isAwayPlaceholder = match.away_team.includes('Grupo') || match.away_team.startsWith('Venc.') || match.away_team.startsWith('Perdedor');

    const homeFlagHTML = isHomePlaceholder ? '' : `<img src="${homeFlagUrl}" alt="" class="bracket-team-flag" onerror="this.src='https://flagcdn.com/un.svg'">`;
    const awayFlagHTML = isAwayPlaceholder ? '' : `<img src="${awayFlagUrl}" alt="" class="bracket-team-flag" onerror="this.src='https://flagcdn.com/un.svg'">`;

    matchEl.innerHTML = `
      <div class="bracket-match-title">${match.group_name}</div>
      <div class="bracket-team ${homeWinnerClass}">
        <div class="bracket-team-name">
          ${homeFlagHTML}
          <span>${match.home_team}</span>
        </div>
        <span class="bracket-team-score">${match.home_score !== null ? match.home_score : ''}</span>
      </div>
      <div class="bracket-team ${awayWinnerClass}">
        <div class="bracket-team-name">
          ${awayFlagHTML}
          <span>${match.away_team}</span>
        </div>
        <span class="bracket-team-score">${match.away_score !== null ? match.away_score : ''}</span>
      </div>
    `;

    targetContainer.appendChild(matchEl);
  });
}

// Render Groups Standings
function renderGroups() {
  const container = document.getElementById('groups-container');
  container.innerHTML = '';

  const groupNames = [
    'Grupo A', 'Grupo B', 'Grupo C', 'Grupo D', 'Grupo E', 'Grupo F',
    'Grupo G', 'Grupo H', 'Grupo I', 'Grupo J', 'Grupo K', 'Grupo L'
  ];

  groupNames.forEach(groupName => {
    // 1. Gather all finished matches for this group
    const groupMatches = matches.filter(m => m.group_name === groupName);
    
    // 2. Initialize teams structure
    const teams = {};
    groupMatches.forEach(m => {
      if (!teams[m.home_team]) {
        teams[m.home_team] = { name: m.home_team, flag: m.home_flag, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
      }
      if (!teams[m.away_team]) {
        teams[m.away_team] = { name: m.away_team, flag: m.away_flag, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 };
      }
    });

    // 3. Process matches to calculate points
    groupMatches.forEach(m => {
      if (m.status === 'finished' && m.home_score !== null && m.away_score !== null) {
        const home = teams[m.home_team];
        const away = teams[m.away_team];

        home.p += 1;
        away.p += 1;
        home.gf += m.home_score;
        home.ga += m.away_score;
        away.gf += m.away_score;
        away.ga += m.home_score;

        if (m.home_score > m.away_score) {
          home.pts += 3;
          home.w += 1;
          away.l += 1;
        } else if (m.away_score > m.home_score) {
          away.pts += 3;
          away.w += 1;
          home.l += 1;
        } else {
          home.pts += 1;
          away.pts += 1;
          home.d += 1;
          away.d += 1;
        }

        home.gd = home.gf - home.ga;
        away.gd = away.gf - away.ga;
      }
    });

    // 4. Sort teams (Pts DESC, GoalDiff DESC, GoalsFor DESC, Name ASC)
    const sortedTeams = Object.values(teams).sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      if (b.gf !== a.gf) return b.gf - a.gf;
      return a.name.localeCompare(b.name);
    });

    // 5. Render Group Card
    const card = document.createElement('div');
    card.className = 'group-table-card glass';

    let tbodyHTML = '';
    sortedTeams.forEach((t, idx) => {
      const flagUrl = `https://flagcdn.com/${t.flag}.svg`;
      tbodyHTML += `
        <tr>
          <td>${idx + 1}</td>
          <td class="team-name">
            <img src="${flagUrl}" alt="" class="bracket-team-flag" onerror="this.src='https://flagcdn.com/un.svg'">
            <span>${t.name}</span>
          </td>
          <td>${t.pts}</td>
          <td>${t.p}</td>
          <td>${t.gd >= 0 ? `+${t.gd}` : t.gd}</td>
        </tr>
      `;
    });

    card.innerHTML = `
      <h3>${groupName}</h3>
      <table class="group-table">
        <thead>
          <tr>
            <th style="width: 25px;">#</th>
            <th style="text-align: left;">Seleção</th>
            <th>Pts</th>
            <th>J</th>
            <th>SG</th>
          </tr>
        </thead>
        <tbody>
          ${tbodyHTML}
        </tbody>
      </table>
    `;

    container.appendChild(card);
  });
}

// 8. ADMIN ACTIONS & RENDERING

// Render Matches inside Admin Panel
function renderAdminMatches() {
  const container = document.getElementById('admin-matches-list');
  container.innerHTML = '';

  const stageVal = document.getElementById('admin-stage-select').value;
  const searchVal = document.getElementById('admin-search-input').value.toLowerCase();

  const filtered = matches.filter(match => {
    if (stageVal !== 'all' && match.stage !== stageVal) return false;
    if (searchVal) {
      const h = match.home_team.toLowerCase();
      const a = match.away_team.toLowerCase();
      if (!h.includes(searchVal) && !a.includes(searchVal)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-secondary text-center py-4">Nenhum jogo encontrado.</p>';
    return;
  }

  filtered.forEach(match => {
    const row = document.createElement('div');
    row.className = 'admin-match-row';

    const homeFlagUrl = `https://flagcdn.com/${match.home_flag}.svg`;
    const awayFlagUrl = `https://flagcdn.com/${match.away_flag}.svg`;

    // Tiebreaker selector needed for Playoff draws
    const isPlayoff = match.stage === 'playoff';
    let playoffTieHTML = '';
    
    if (isPlayoff) {
      playoffTieHTML = `
        <div class="mt-2 text-secondary" style="font-size: 0.75rem; width: 100%;">
          Em caso de empate, quem avançou? 
          <select id="adv-${match.id}" style="padding: 0.2rem 0.5rem; font-size: 0.75rem;">
            <option value="home" ${match.status === 'finished' && match.home_team === getNextRoundAdvancingTeamName(match) ? 'selected' : ''}>${match.home_team}</option>
            <option value="away" ${match.status === 'finished' && match.away_team === getNextRoundAdvancingTeamName(match) ? 'selected' : ''}>${match.away_team}</option>
          </select>
        </div>
      `;
    }

    row.innerHTML = `
      <div style="flex: 1; min-width: 250px;">
        <div class="admin-match-teams">
          <div class="admin-team">
            <img src="${homeFlagUrl}" alt="" class="bracket-team-flag" onerror="this.src='https://flagcdn.com/un.svg'">
            <span>${match.home_team}</span>
          </div>
          <span class="text-secondary" style="font-size: 0.8rem;">x</span>
          <div class="admin-team">
            <img src="${awayFlagUrl}" alt="" class="bracket-team-flag" onerror="this.src='https://flagcdn.com/un.svg'">
            <span>${match.away_team}</span>
          </div>
        </div>
        <div class="text-secondary" style="font-size: 0.75rem; margin-top: 0.25rem;">
          ${match.group_name} • ${formatDateBR(new Date(match.match_date))}
        </div>
        ${playoffTieHTML}
      </div>

      <div class="admin-match-inputs">
        <input type="text" id="adm-h-${match.id}" value="${match.home_score !== null ? match.home_score : ''}" placeholder="-">
        <span>x</span>
        <input type="text" id="adm-a-${match.id}" value="${match.away_score !== null ? match.away_score : ''}" placeholder="-">
        <button class="btn-primary btn-sm ml-2" id="adm-save-btn-${match.id}">Salvar</button>
      </div>
    `;

    container.appendChild(row);

    // Bind save click
    document.getElementById(`adm-save-btn-${match.id}`).addEventListener('click', () => {
      saveMatchScoreAdmin(match.id);
    });

    // Enforce digit filtering
    document.getElementById(`adm-h-${match.id}`).addEventListener('input', e => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });
    document.getElementById(`adm-a-${match.id}`).addEventListener('input', e => {
      e.target.value = e.target.value.replace(/[^0-9]/g, '');
    });
  });
}

// Get the advancing team currently saved in the next round node (if any)
function getNextRoundAdvancingTeamName(match) {
  const node = match.bracket_node;
  if (!node || !PLAYOFF_MAPPING[node]) return '';
  const mapping = PLAYOFF_MAPPING[node];
  const nextMatch = matches.find(m => m.id === mapping.next_id);
  if (!nextMatch) return '';
  return mapping.pos === 'home' ? nextMatch.home_team : nextMatch.away_team;
}

// Save Score from Admin Panel and handle playoff advancement logic
async function saveMatchScoreAdmin(matchId) {
  const homeVal = document.getElementById(`adm-h-${matchId}`).value.trim();
  const awayVal = document.getElementById(`adm-a-${matchId}`).value.trim();

  if (homeVal === '' || awayVal === '') {
    alert("Por favor, preencha ambos os placares para finalizar.");
    return;
  }

  const homeScore = parseInt(homeVal);
  const awayScore = parseInt(awayVal);

  showLoading(true);
  try {
    const match = matches.find(m => m.id === matchId);
    if (!match) throw new Error("Jogo não encontrado.");

    // Update match score & status in Supabase
    const { error: updateError } = await supabase
      .from('matches')
      .update({
        home_score: homeScore,
        away_score: awayScore,
        status: 'finished'
      })
      .eq('id', matchId);

    if (updateError) throw updateError;

    // Handle Playoff Advancement (Round of 32 -> Round of 16 -> QF -> SF -> Finals)
    if (match.stage === 'playoff' && match.bracket_node) {
      const node = match.bracket_node;
      const mapping = PLAYOFF_MAPPING[node];

      if (mapping) {
        let winnerName = '';
        let winnerFlag = '';
        
        let loserName = '';
        let loserFlag = '';

        if (homeScore > awayScore) {
          winnerName = match.home_team;
          winnerFlag = match.home_flag;
          loserName = match.away_team;
          loserFlag = match.away_flag;
        } else if (awayScore > homeScore) {
          winnerName = match.away_team;
          winnerFlag = match.away_flag;
          loserName = match.home_team;
          loserFlag = match.home_flag;
        } else {
          // It's a draw, get tiebreaker selection from UI
          const tieSelect = document.getElementById(`adv-${matchId}`);
          const advChoice = tieSelect ? tieSelect.value : 'home';
          if (advChoice === 'home') {
            winnerName = match.home_team;
            winnerFlag = match.home_flag;
            loserName = match.away_team;
            loserFlag = match.away_flag;
          } else {
            winnerName = match.away_team;
            winnerFlag = match.away_flag;
            loserName = match.home_team;
            loserFlag = match.home_flag;
          }
        }

        // Advance Winner to next_match
        const updateNextMatchData = {};
        if (mapping.pos === 'home') {
          updateNextMatchData.home_team = winnerName;
          updateNextMatchData.home_flag = winnerFlag;
        } else {
          updateNextMatchData.away_team = winnerName;
          updateNextMatchData.away_flag = winnerFlag;
        }

        const { error: winnerError } = await supabase
          .from('matches')
          .update(updateNextMatchData)
          .eq('id', mapping.next_id);

        if (winnerError) throw winnerError;

        // Advance Loser if Semifinal (goes to Third-place Match)
        if (mapping.loser_id) {
          const updateLoserData = {};
          if (mapping.loser_pos === 'home') {
            updateLoserData.home_team = loserName;
            updateLoserData.home_flag = loserFlag;
          } else {
            updateLoserData.away_team = loserName;
            updateLoserData.away_flag = loserFlag;
          }

          const { error: loserError } = await supabase
            .from('matches')
            .update(updateLoserData)
            .eq('id', mapping.loser_id);

          if (loserError) throw loserError;
        }
      }
    }

    alert("Placar oficial salvo! Pontuações recalculadas com sucesso.");
    await refreshAllData();
    await renderAdminMatches();
  } catch (err) {
    console.error("Erro ao salvar placar de admin:", err);
    alert("Erro ao salvar placar. Verifique o console.");
  }
  showLoading(false);
}

// Danger Zone: Reset matches database
async function handleDangerReset() {
  const conf = confirm("ATENÇÃO: Isso vai resetar os placares de TODOS os 104 jogos para vazio (null) e status para 'scheduled'.\n\nDeseja mesmo prosseguir?");
  if (!conf) return;

  const conf2 = prompt("Digite 'RESETER' para confirmar a ação:");
  if (conf2 !== 'RESETER') return;

  showLoading(true);
  try {
    const { error } = await supabase
      .from('matches')
      .update({
        home_score: null,
        away_score: null,
        status: 'scheduled'
      })
      .neq('id', 0); // Updates all rows

    if (error) throw error;

    alert("Banco de dados de jogos resetado com sucesso!");
    await refreshAllData();
    await renderAdminMatches();
  } catch (err) {
    console.error("Erro ao resetar jogos:", err);
    alert("Falha ao resetar. Detalhes no console.");
  }
  showLoading(false);
}

// ==========================================================================
// ACCESS REQUESTS & INVITE CODES SYSTEM
// ==========================================================================

async function getAccessConfig(key, defaultValue) {
  try {
    const { data, error } = await supabase
      .from('config')
      .select('value')
      .eq('key', key)
      .maybeSingle();
      
    if (error) throw error;
    if (data && data.value) {
      return JSON.parse(data.value);
    }
  } catch (err) {
    console.error(`Erro ao obter config ${key}:`, err);
  }
  return defaultValue;
}

async function saveAccessConfig(key, value) {
  try {
    const { error } = await supabase
      .from('config')
      .upsert({
        key: key,
        value: JSON.stringify(value)
      });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error(`Erro ao salvar config ${key}:`, err);
    return false;
  }
}

async function handleRequestAccessCode() {
  const nameInput = document.getElementById('username-input').value.trim();
  const errorMsg = document.getElementById('onboarding-error');

  if (!nameInput || nameInput.length < 3) {
    showError(errorMsg, "Por favor, digite seu nome no campo 'Nome ou Apelido' para solicitar o código.");
    return;
  }

  showLoading(true);
  try {
    const requests = await getAccessConfig('access_requests', []);
    
    // Check if name already registered in participants
    const { data: existingUser, error: userError } = await supabase
      .from('participants')
      .select('id')
      .ilike('name', nameInput)
      .maybeSingle();

    if (existingUser) {
      showError(errorMsg, "Este nome já está cadastrado no bolão!");
      showLoading(false);
      return;
    }

    // Check if name already requested
    const existingReq = requests.find(r => r.name.toLowerCase() === nameInput.toLowerCase());
    if (existingReq) {
      if (existingReq.status === 'pending') {
        alert("Você já enviou uma solicitação de acesso. Ela está pendente de aprovação com o administrador.");
      } else if (existingReq.status === 'approved') {
        alert(`Sua solicitação já foi aprovada pelo administrador!\nUse o código: ${existingReq.invite_code}`);
        document.getElementById('invite-code-input').value = existingReq.invite_code;
      } else {
        alert("Sua solicitação de acesso foi recusada. Fale com o administrador.");
      }
      showLoading(false);
      return;
    }

    // Add new request
    requests.push({
      name: nameInput,
      status: 'pending',
      invite_code: null,
      created_at: new Date().toISOString()
    });

    await saveAccessConfig('access_requests', requests);
    alert("Solicitação enviada com sucesso!\nEntre em contato com o administrador do bolão para pagar a taxa e receber seu código de acesso.");
    
    errorMsg.classList.add('hidden');
  } catch (err) {
    console.error("Erro ao solicitar acesso:", err);
    showError(errorMsg, "Erro ao enviar solicitação.");
  }
  showLoading(false);
}

// Generate random invite code
function generateRandomCode() {
  return 'COPA-' + Math.floor(1000 + Math.random() * 9000);
}

async function handleAdminGenerateManualCode() {
  showLoading(true);
  try {
    const activeCodes = await getAccessConfig('invite_codes', []);
    let newCode = generateRandomCode();
    
    // Ensure uniqueness
    while (activeCodes.includes(newCode)) {
      newCode = generateRandomCode();
    }

    activeCodes.push(newCode);
    const success = await saveAccessConfig('invite_codes', activeCodes);
    
    if (success) {
      alert(`Código manual gerado com sucesso: ${newCode}`);
      inviteCodes = activeCodes;
      await renderAdminAccessSection();
    } else {
      alert("Erro ao salvar o novo código.");
    }
  } catch (err) {
    console.error(err);
    alert("Erro ao gerar código.");
  }
  showLoading(false);
}

async function renderAdminAccessSection() {
  try {
    // Load config states
    inviteCodes = await getAccessConfig('invite_codes', []);
    accessRequests = await getAccessConfig('access_requests', []);

    // Set counts in sub-tab buttons
    document.getElementById('requests-count').textContent = accessRequests.filter(r => r.status === 'pending').length;
    document.getElementById('codes-count').textContent = inviteCodes.length;

    const listContainer = document.getElementById('admin-access-list');
    listContainer.innerHTML = '';

    if (adminAccessSubtab === 'requests') {
      const pendingReqs = accessRequests.filter(r => r.status === 'pending');
      
      if (pendingReqs.length === 0) {
        listContainer.innerHTML = '<p class="text-secondary text-center" style="margin: 1rem 0;">Nenhuma solicitação de acesso pendente.</p>';
        return;
      }

      pendingReqs.forEach((req) => {
        const item = document.createElement('div');
        item.className = 'admin-match-row'; // Use same styling layout
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '0.5rem 0';
        item.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

        item.innerHTML = `
          <div style="display:flex; flex-direction:column; gap:0.2rem;">
            <strong style="color:var(--color-text);">${escapeHTML(req.name)}</strong>
            <small style="color:var(--color-text-secondary); font-size:0.75rem;">Solicitado em: ${new Date(req.created_at).toLocaleString()}</small>
          </div>
          <div style="display:flex; gap:0.5rem;">
            <button class="btn-primary btn-sm btn-approve" data-name="${escapeHTML(req.name)}">Aprovar</button>
            <button class="btn-danger btn-sm btn-reject" data-name="${escapeHTML(req.name)}" style="padding:0.25rem 0.5rem; font-size:0.8rem;">Rejeitar</button>
          </div>
        `;
        listContainer.appendChild(item);
      });

      // Bind approve/reject buttons
      listContainer.querySelectorAll('.btn-approve').forEach(btn => {
        btn.addEventListener('click', async () => {
          const reqName = btn.getAttribute('data-name');
          await handleApproveRequest(reqName);
        });
      });

      listContainer.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', async () => {
          const reqName = btn.getAttribute('data-name');
          await handleRejectRequest(reqName);
        });
      });

    } else {
      // CODES TAB
      if (inviteCodes.length === 0) {
        listContainer.innerHTML = '<p class="text-secondary text-center" style="margin: 1rem 0;">Nenhum código de convite ativo no momento.</p>';
        return;
      }

      inviteCodes.forEach((code) => {
        const item = document.createElement('div');
        item.className = 'admin-match-row';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '0.5rem 0';
        item.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

        item.innerHTML = `
          <div>
            <code style="font-family:monospace; font-size:1.1rem; color:var(--color-accent); font-weight:bold; letter-spacing:1px;">${code}</code>
          </div>
          <div style="display:flex; gap:0.5rem;">
            <button class="btn-secondary btn-sm btn-copy-code" data-code="${code}">Copiar</button>
            <button class="btn-danger btn-sm btn-delete-code" data-code="${code}" style="padding:0.25rem 0.5rem; font-size:0.8rem;">Excluir</button>
          </div>
        `;
        listContainer.appendChild(item);
      });

      // Bind copy/delete buttons
      listContainer.querySelectorAll('.btn-copy-code').forEach(btn => {
        btn.addEventListener('click', () => {
          const code = btn.getAttribute('data-code');
          navigator.clipboard.writeText(code);
          btn.textContent = 'Copiado!';
          setTimeout(() => btn.textContent = 'Copiar', 2000);
        });
      });

      listContainer.querySelectorAll('.btn-delete-code').forEach(btn => {
        btn.addEventListener('click', async () => {
          const code = btn.getAttribute('data-code');
          if (confirm(`Excluir o código ${code}? Ele não poderá mais ser usado.`)) {
            showLoading(true);
            const activeCodes = await getAccessConfig('invite_codes', []);
            const index = activeCodes.indexOf(code);
            if (index !== -1) {
              activeCodes.splice(index, 1);
              await saveAccessConfig('invite_codes', activeCodes);
              
              // Also update status in request to code_deleted
              const reqs = await getAccessConfig('access_requests', []);
              const reqIndex = reqs.findIndex(r => r.invite_code === code);
              if (reqIndex !== -1) {
                reqs[reqIndex].status = 'code_deleted';
                await saveAccessConfig('access_requests', reqs);
              }

              await renderAdminAccessSection();
            }
            showLoading(false);
          }
        });
      });
    }
  } catch (err) {
    console.error("Erro ao renderizar seção de acessos:", err);
  }
}

async function handleApproveRequest(reqName) {
  showLoading(true);
  try {
    const requests = await getAccessConfig('access_requests', []);
    const req = requests.find(r => r.name === reqName);
    
    if (req && req.status === 'pending') {
      const activeCodes = await getAccessConfig('invite_codes', []);
      let newCode = generateRandomCode();
      while (activeCodes.includes(newCode)) {
        newCode = generateRandomCode();
      }

      activeCodes.push(newCode);
      req.status = 'approved';
      req.invite_code = newCode;

      await saveAccessConfig('invite_codes', activeCodes);
      await saveAccessConfig('access_requests', requests);

      alert(`Solicitação de ${reqName} aprovada!\nCódigo gerado: ${newCode}\nCopie e envie para o participante.`);
      await renderAdminAccessSection();
    }
  } catch (err) {
    console.error(err);
    alert("Erro ao aprovar solicitação.");
  }
  showLoading(false);
}

async function handleRejectRequest(reqName) {
  if (confirm(`Deseja realmente rejeitar/excluir a solicitação de ${reqName}?`)) {
    showLoading(true);
    try {
      const requests = await getAccessConfig('access_requests', []);
      const index = requests.findIndex(r => r.name === reqName);
      if (index !== -1) {
        requests.splice(index, 1);
        await saveAccessConfig('access_requests', requests);
        await renderAdminAccessSection();
      }
    } catch (err) {
      console.error(err);
      alert("Erro ao rejeitar solicitação.");
    }
    showLoading(false);
  }
}

// ==========================================================================
// AUDITING / MATCH GUESSES PUBLIC DISCLOSURE SYSTEM
// ==========================================================================

function setupAuditButtonsHandlers() {
  const auditBtns = document.querySelectorAll('.btn-audit');
  auditBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const matchId = parseInt(btn.getAttribute('data-match-id'));
      openAuditModal(matchId);
    });
  });
}

async function openAuditModal(matchId) {
  // Show Modal
  document.getElementById('audit-modal').classList.remove('hidden');

  // Find match details
  const match = matches.find(m => m.id === matchId);
  if (!match) return;

  document.getElementById('audit-match-header').innerHTML = `
    ${match.home_team} x ${match.away_team}<br>
    <span style="font-size:0.75rem; color:var(--color-text-secondary); font-weight:normal;">
      Início: ${formatDateBR(new Date(match.match_date))}
    </span>
  `;

  const listContainer = document.getElementById('audit-guesses-list');
  listContainer.innerHTML = '<p class="text-secondary text-center" style="margin: 1.5rem 0;">Buscando palpites... ⏳</p>';

  try {
    // Fetch all guesses for this match with participant names joined
    const { data: guesses, error } = await supabase
      .from('guesses')
      .select('home_score, away_score, points, participants(name)')
      .eq('match_id', matchId);

    if (error) throw error;

    // Recalcular pontos client-side sob as novas regras
    (guesses || []).forEach(g => {
      let pts = 0;
      if (match.status === 'finished' && match.home_score !== null && match.away_score !== null) {
        if (g.home_score === match.home_score && g.away_score === match.away_score) {
          pts = 10;
        } else if (match.home_score !== match.away_score &&
                   (g.home_score - g.away_score) === (match.home_score - match.away_score) &&
                   Math.sign(g.home_score - g.away_score) === Math.sign(match.home_score - match.away_score)) {
          pts = 5;
        } else if (Math.sign(g.home_score - g.away_score) === Math.sign(match.home_score - match.away_score)) {
          pts = 3;
        }
      }
      g.points = pts;
    });

    // Sort: If match is finished, sort by points DESC, then name ASC.
    // If ongoing/not finished, sort by name ASC.
    guesses.sort((a, b) => {
      if (match.status === 'finished') {
        const pointsA = a.points || 0;
        const pointsB = b.points || 0;
        if (pointsB !== pointsA) return pointsB - pointsA;
      }
      const nameA = a.participants?.name || '';
      const nameB = b.participants?.name || '';
      return nameA.localeCompare(nameB);
    });

    if (guesses.length === 0) {
      listContainer.innerHTML = '<p class="text-secondary text-center" style="margin: 1.5rem 0;">Nenhum palpite registrado para este jogo.</p>';
      return;
    }

    listContainer.innerHTML = '';
    guesses.forEach(g => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.alignItems = 'center';
      row.style.padding = '0.6rem 0.5rem';
      row.style.borderBottom = '1px solid rgba(255,255,255,0.06)';

      const hasPoints = match.status === 'finished' && g.points !== null && g.points !== undefined;
      let pointsBadge = '';
      if (hasPoints) {
        let ptsClass = 'color: var(--color-text-secondary);';
        if (g.points === 10) ptsClass = 'color: var(--color-accent); font-weight: 700;';
        else if (g.points === 5) ptsClass = 'color: var(--color-gold); font-weight: 700;';
        else if (g.points === 3) ptsClass = 'color: var(--color-primary); font-weight: 700;';
        pointsBadge = `<span style="font-size: 0.75rem; margin-left: 0.5rem; ${ptsClass}">(+${g.points} pts)</span>`;
      }

      row.innerHTML = `
        <div style="display:flex; flex-direction:column;">
          <strong style="color: var(--color-text); font-size: 0.9rem;">${escapeHTML(g.participants?.name || 'Anônimo')}</strong>
        </div>
        <div style="font-family: var(--font-family); font-size: 1rem; font-weight: bold;">
          <span style="color: var(--color-accent);">${g.home_score}</span>
          <span style="color: var(--color-text-secondary); margin: 0 0.15rem;">x</span>
          <span style="color: var(--color-accent);">${g.away_score}</span>
          ${pointsBadge}
        </div>
      `;
      listContainer.appendChild(row);
    });

  } catch (err) {
    console.error("Erro ao auditar palpites:", err);
    listContainer.innerHTML = '<p class="text-danger text-center" style="margin: 1.5rem 0;">Falha de conexão ao buscar palpites.</p>';
  }
}

async function openPlayerAuditModal(playerId, playerName) {
  const modal = document.getElementById('audit-player-modal');
  const nameEl = document.getElementById('audit-player-name');
  const listContainer = document.getElementById('audit-player-guesses-list');

  // Define o nome do participante
  nameEl.textContent = playerName;
  modal.classList.remove('hidden');

  // Mensagem de carregamento
  listContainer.innerHTML = '<p class="text-secondary text-center" style="margin: 1.5rem 0;">Buscando palpites... ⏳</p>';

  try {
    const clientTodayStr = new Date().toLocaleDateString('en-CA');
    // Busca todos os palpites deste participante
    const { data: guesses, error } = await supabase
      .from('guesses')
      .select('match_id, home_score, away_score, points')
      .eq('participant_id', playerId);

    if (error) throw error;

    // Coloca os palpites em um mapa para busca rápida por match_id
    const guessMap = {};
    (guesses || []).forEach(g => {
      // Recalcular pontos client-side sob as novas regras
      const match = matches.find(m => m.id === g.match_id);
      let pts = 0;
      if (match && match.status === 'finished' && match.home_score !== null && match.away_score !== null) {
        if (g.home_score === match.home_score && g.away_score === match.away_score) {
          pts = 10;
        } else if (match.home_score !== match.away_score &&
                   (g.home_score - g.away_score) === (match.home_score - match.away_score) &&
                   Math.sign(g.home_score - g.away_score) === Math.sign(match.home_score - match.away_score)) {
          pts = 5;
        } else if (Math.sign(g.home_score - g.away_score) === Math.sign(match.home_score - match.away_score)) {
          pts = 3;
        }
      }
      g.points = pts;
      guessMap[g.match_id] = g;
    });

    // Filter matches to match the active bolão rules: only group stage (include past matches for auditing)
    const activeMatches = matches.filter(match => match.stage === 'group');

    if (activeMatches.length === 0) {
      listContainer.innerHTML = '<p class="text-secondary text-center" style="margin: 1.5rem 0;">Nenhum jogo da fase de grupos encontrado.</p>';
      return;
    }

    listContainer.innerHTML = '';
    
    // Verifica se o participante auditado é o próprio usuário logado
    const isSelf = currentUser && playerId === currentUser.id;

    activeMatches.forEach(match => {
      const isLocked = new Date(match.match_date) <= new Date();
      const g = guessMap[match.id] || null;
      const hasGuess = g !== null;

      const card = document.createElement('div');
      card.className = 'audit-player-match-card';

      // 1. Determina o texto do palpite (e esconde se for jogo futuro de outro jogador)
      let guessText = '- x -';
      let lockSuffix = '';
      
      if (hasGuess) {
        if (isLocked || isSelf) {
          guessText = `${g.home_score} x ${g.away_score}`;
        } else {
          guessText = '🔒 Oculto';
          lockSuffix = ' (Palpitado)';
        }
      } else {
        guessText = 'Sem palpite';
      }

      // 2. Determina o placar oficial / status do jogo
      let officialScoreText = '';
      if (match.status === 'finished' && match.home_score !== null && match.away_score !== null) {
        officialScoreText = `Placar oficial: ${match.home_score} x ${match.away_score}`;
      } else if (isLocked) {
        officialScoreText = 'Em andamento';
      } else {
        officialScoreText = 'Não iniciado';
      }

      // 3. Determina o texto de pontos conquistados (se finalizado)
      let pointsText = '';
      if (match.status === 'finished') {
        if (hasGuess) {
          const pts = g.points !== null && g.points !== undefined ? g.points : 0;
          let ptsClass = 'color: var(--color-text-secondary);';
          if (pts === 10) ptsClass = 'color: var(--color-accent); font-weight: 700;';
          else if (pts === 5) ptsClass = 'color: var(--color-gold); font-weight: 700;';
          else if (pts === 3) ptsClass = 'color: var(--color-primary); font-weight: 700;';
          pointsText = `<span style="font-size: 0.75rem; padding: 0.15rem 0.4rem; border-radius: 4px; background: rgba(255,255,255,0.05); ${ptsClass}">+${pts} pts</span>`;
        } else {
          pointsText = `<span style="font-size: 0.75rem; padding: 0.15rem 0.4rem; border-radius: 4px; background: rgba(255,255,255,0.05); color: var(--color-text-secondary);">0 pts</span>`;
        }
      }

      // 4. Badge do status da partida
      let statusBadge = '';
      if (match.status === 'finished') {
        statusBadge = '<span style="font-size: 0.65rem; padding: 0.15rem 0.35rem; border-radius: 3px; background: rgba(255, 255, 255, 0.1); color: #9ca3af;">Encerrado</span>';
      } else if (isLocked) {
        statusBadge = '<span style="font-size: 0.65rem; padding: 0.15rem 0.35rem; border-radius: 3px; background: rgba(234, 179, 8, 0.15); color: #facc15;">Bloqueado</span>';
      } else {
        statusBadge = '<span style="font-size: 0.65rem; padding: 0.15rem 0.35rem; border-radius: 3px; background: rgba(57, 255, 20, 0.15); color: var(--color-accent);">Aberto</span>';
      }

      const homeFlagUrl = `https://flagcdn.com/${match.home_flag}.svg`;
      const awayFlagUrl = `https://flagcdn.com/${match.away_flag}.svg`;

      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--color-text-secondary); margin-bottom: 0.25rem;">
          <span>${match.group_name} • ${formatDateBR(new Date(match.match_date))}</span>
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            ${statusBadge}
          </div>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.25rem;">
          <div style="display: flex; align-items: center; gap: 0.4rem; flex: 1; min-width: 0;">
            <img src="${homeFlagUrl}" style="width: 18px; height: 12px; object-fit: cover; border-radius: 2px; flex-shrink: 0;" onerror="this.src='https://flagcdn.com/un.svg'">
            <span style="font-size: 0.8rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${match.home_team}</span>
          </div>
          
          <div style="text-align: center; padding: 0 0.25rem; min-width: 90px; flex-shrink: 0;">
            <span style="font-size: 0.85rem; font-weight: bold; color: ${hasGuess && !isLocked && !isSelf ? 'var(--color-text-secondary)' : 'var(--color-accent)'};">${guessText}${lockSuffix}</span>
            ${officialScoreText ? `<div style="font-size: 0.65rem; color: var(--color-text-secondary); margin-top: 0.05rem;">${officialScoreText}</div>` : ''}
          </div>
          
          <div style="display: flex; align-items: center; gap: 0.4rem; flex: 1; justify-content: flex-end; min-width: 0; text-align: right;">
            <span style="font-size: 0.8rem; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${match.away_team}</span>
            <img src="${awayFlagUrl}" style="width: 18px; height: 12px; object-fit: cover; border-radius: 2px; flex-shrink: 0;" onerror="this.src='https://flagcdn.com/un.svg'">
          </div>
        </div>
        ${pointsText ? `<div style="display: flex; justify-content: flex-end; margin-top: 0.15rem;">${pointsText}</div>` : ''}
      `;
      listContainer.appendChild(card);
    });

  } catch (err) {
    console.error("Erro ao carregar auditoria do jogador:", err);
    listContainer.innerHTML = '<p class="text-danger text-center" style="margin: 1.5rem 0;">Falha ao carregar palpites.</p>';
  }
}

// 9. UTILITY FUNCTIONS

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback RFC4122 v4 compliant UUID generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function showLoading(show) {
  const screen = document.getElementById('loading-screen');
  if (show) screen.classList.remove('hidden');
  else screen.classList.add('hidden');
}

function showError(element, msg) {
  element.textContent = msg;
  element.classList.remove('hidden');
}

function formatDateBR(date) {
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo'
  }).replace(',', ' -');
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}
})();
