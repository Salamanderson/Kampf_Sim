// FILE: js/main.js
(function(){
  window.Engine = window.Engine || {};
  window.Scenes = window.Scenes || {};
  window.GameBridge = window.GameBridge || {};
  window.GameData = window.GameData || { characters:[] };

  // ----- Bridge Brython -----
  let brythonReady = false;
  function checkBrythonReady(){
    try { if (window.PY_AI_READY === true && typeof window.PY_AI_DECIDE === 'function') brythonReady = true; }
    catch(e){}
    return brythonReady;
  }
  window.GameBridge.isBrythonReady = () => checkBrythonReady();
  window.GameBridge.getAIAction = function(profileId, stateObj, useBrython=true){
    if (!stateObj || typeof stateObj !== 'object') return 'idle';
    const wantBry = !!useBrython && checkBrythonReady();
    if (wantBry){
      try{
        const res = window.PY_AI_DECIDE(profileId, JSON.stringify(stateObj));
        if (typeof res === 'string' && res) return res;
      }catch(e){}
    }
    return jsFallbackAI(profileId, stateObj);
  };

  // Fallback-KI
  function jsFallbackAI(profileId, s){
    const me = s.self, e = s.closestEnemy;
    if (!e) return 'idle';
    const dx = e.x - me.x, dy = e.y - me.y;
    const dist = Math.hypot(dx, dy);

    if (me.hp < me.maxHp*0.35 && s.cooldowns.heal <= 0) return 'heal';

    if (profileId === 'aggressive'){
      if (dist > 220) return 'move_towards';
      if (dist > 140 && Math.random()<0.35) return 'dash';
      if (dist < 90 && Math.random()<0.35) return 'spin';
      return Math.random()<0.6 ? 'attack_light' : 'attack_heavy';
    }
    if (profileId === 'defensive'){
      if (dist < 120 && Math.random()<0.4) return (Math.random()<0.5)?'strafe_left':'strafe_right';
      if (dist < 140) return 'move_away';
      if (dist > 220 && Math.random()<0.25) return 'dash';
      return 'attack_light';
    }
    const acts = ['move_towards','move_away','strafe_left','strafe_right','dash','attack_light','attack_heavy','spin','heal','idle'];
    return acts[(Math.random()*acts.length)|0];
  }

  // ----- Phaser Config -----
  const config = {
    type: Phaser.AUTO,
    backgroundColor: '#0f0f16',
    parent: 'game-root',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH, width: 1280, height: 720 },
    fps: { target: 60, forceSetTimeOut: true },
    scene: [ Scenes.BootScene, Scenes.PreloadScene, Scenes.FightScene ]
  };

  // ----- UI helpers -----
  function populateCharacterSelects(){
    const p1sel = document.getElementById('p1char');
    const p2sel = document.getElementById('p2char');
    const ccLoad= document.getElementById('cc-load');
    const chars = window.GameData.characters || [];

    [p1sel, p2sel, ccLoad].forEach(sel=>{
      if (!sel) return;
      sel.innerHTML = '';
      chars.forEach(c=>{
        const opt = document.createElement('option');
        opt.value = c.id; opt.textContent = c.name;
        sel.appendChild(opt);
      });
    });

    if (p1sel && chars[0]) p1sel.value = chars[0].id;
    if (p2sel && chars[1]) p2sel.value = chars[1].id || chars[0].id;
    if (ccLoad && chars[0]) ccLoad.value = chars[0].id;
  }

    function setActiveTab(id){
      document.querySelectorAll('#ui-header .tab').forEach(b=>b.classList.remove('active'));
      document.getElementById(id)?.classList.add('active');

      // alle Panel-Inhalte verbergen
      document.querySelectorAll('#ui-left > div').forEach(d=>d.style.display='none');
      document.querySelectorAll('#ui-right > div').forEach(d=>d.style.display='none');

      let mode = 'simulator';
      if (id === 'tab-sim'){
        document.getElementById('panel-sim-left').style.display='block';
        document.getElementById('panel-sim-right').style.display='block';
        mode = 'simulator';
      } else if (id === 'tab-char'){
        document.getElementById('panel-char-left').style.display='block';
        document.getElementById('panel-char-right').style.display='block';
        startCharCreatorPreviewFromSelection();
        mode = 'char_creator';
      } else if (id === 'tab-manager'){
        document.getElementById('panel-manager-left').style.display='block';
        document.getElementById('panel-manager-right').style.display='block';
        populateRoster();
        mode = 'manager';
      } else if (id === 'tab-skill'){
        document.getElementById('panel-skill-left').style.display='block';
        document.getElementById('panel-skill-right').style.display='block';
        mode = 'skill_creator';
      } else if (id === 'tab-ai'){
        document.getElementById('panel-ai-left').style.display='block';
        document.getElementById('panel-ai-right').style.display='block';
        mode = 'ai_creator';
      }
      window.dispatchEvent(new CustomEvent('VC_SET_MODE', { detail:{ mode }}));
    }

  function flashSkill(side, skill){
    const id = `${side.toLowerCase()}-skill-${skill}`;
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('active');
    setTimeout(()=>el.classList.remove('active'), 260);
  }

  function setupSkillButtons(){
    document.querySelectorAll('.skill-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const side = btn.getAttribute('data-side');
        const skill= btn.getAttribute('data-skill');
        window.dispatchEvent(new CustomEvent('VC_FORCE_SKILL', { detail:{ side, skill } }));
      });
    });

    window.addEventListener('VC_PANEL_FLASH', (ev)=>{
      const d = ev.detail||{}; flashSkill(d.side, d.skill);
    });
  }

  function bindHeader(){
    const btn = document.getElementById('btn-start');
    btn?.addEventListener('click', ()=>{
      window.dispatchEvent(new CustomEvent('VC_RESTART_MATCH', {
        detail: {
          p1: document.getElementById('p1ai')?.value || 'aggressive',
          p2: document.getElementById('p2ai')?.value || 'defensive',
          showHit: !!document.getElementById('toggle-hitboxes')?.checked,
          showDebug: !!document.getElementById('toggle-debug')?.checked,
          useBrython: !!document.getElementById('toggle-ki-brython')?.checked,
          p1CharId: document.getElementById('p1char')?.value,
          p2CharId: document.getElementById('p2char')?.value
        }
      }));
    });

    document.getElementById('tab-manager')?.addEventListener('click', ()=>setActiveTab('tab-manager'));
    document.getElementById('tab-sim')?.addEventListener('click', ()=>setActiveTab('tab-sim'));
    document.getElementById('tab-char')?.addEventListener('click', ()=>setActiveTab('tab-char'));
    document.getElementById('tab-skill')?.addEventListener('click', ()=>setActiveTab('tab-skill'));
    document.getElementById('tab-ai')?.addEventListener('click', ()=>setActiveTab('tab-ai'));
  }

  function initHUDWindow(){
    const win = document.getElementById('hud-window');
    const title = document.getElementById('hud-title');
    if (!win || !title) return;
    let dragging = false, offX = 0, offY = 0;
    title.addEventListener('mousedown', e=>{
      dragging = true;
      offX = e.clientX - win.offsetLeft;
      offY = e.clientY - win.offsetTop;
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
    function move(e){ if (!dragging) return; win.style.left = (e.clientX - offX) + 'px'; win.style.top = (e.clientY - offY) + 'px'; }
    function up(){ dragging=false; document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); }
  }

  // ----- Char Creator: State & Live-Preview -----
  let ccState = null; // aktueller Entwurf

  function currentCCDef(){
    // Aus Eingabefeldern lesen
    const hex  = document.getElementById('cc-color').value||'#64c8ff';
    const color= parseInt(hex.slice(1), 16);
    const loadout = [];
    if (document.getElementById('cc-skill-light').checked) loadout.push('light');
    if (document.getElementById('cc-skill-heavy').checked) loadout.push('heavy');
    if (document.getElementById('cc-skill-spin').checked)  loadout.push('spin');
    if (document.getElementById('cc-skill-heal').checked)  loadout.push('heal');

    return {
      id: (document.getElementById('cc-name').value||'custom').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'') || 'custom',
      name: document.getElementById('cc-name').value || 'Custom',
      shape: document.getElementById('cc-shape').value || 'circle',
      color, radius: parseInt(document.getElementById('cc-radius').value||'22',10),
      stats: {
        maxHp: parseInt(document.getElementById('cc-maxhp').value||'120',10),
        maxEn: parseInt(document.getElementById('cc-maxen').value||'100',10),
        physAtk: parseFloat(document.getElementById('cc-physatk').value||'1'),
        energyAtk: parseFloat(document.getElementById('cc-enatk').value||'1'),
        attackSpeed: parseFloat(document.getElementById('cc-atkspd').value||'1'),
        castSpeed: parseFloat(document.getElementById('cc-castspd').value||'1'),
        channelSpeed: parseFloat(document.getElementById('cc-chanspd').value||'1'),
        physRange: parseFloat(document.getElementById('cc-physrng').value||'1'),
        energyRange: parseFloat(document.getElementById('cc-enrng').value||'1'),
        accel: parseFloat(document.getElementById('cc-accel').value||'1800'),
        moveSpeed: parseFloat(document.getElementById('cc-speed').value||'240'),
        dashSpeed: parseFloat(document.getElementById('cc-dash').value||'560'),
        friction: parseFloat(document.getElementById('cc-fric').value||'0.86'),
        physDef: parseFloat(document.getElementById('cc-physdef').value||'0'),
        energyDef: parseFloat(document.getElementById('cc-endef').value||'0'),
        hpRegen: parseFloat(document.getElementById('cc-hpreg').value||'0'),
        enRegen: parseFloat(document.getElementById('cc-enreg').value||'0'),
        skillSlots: parseInt(document.getElementById('cc-slots').value||'4',10),
        special: document.getElementById('cc-special').value || null,
        statusPower: parseFloat(document.getElementById('cc-stapow').value||'0'),
        statusDuration: parseFloat(document.getElementById('cc-stadur').value||'1'),
        statusResist: parseFloat(document.getElementById('cc-stares').value||'0'),
        statusDurationResist: parseFloat(document.getElementById('cc-stadurres').value||'1'),
        damageScale: 1.0
      },
      loadout
    };
  }

  function applyCCDefToForm(def){
    document.getElementById('cc-name').value = def.name || '';
    document.getElementById('cc-shape').value= def.shape || 'circle';
    document.getElementById('cc-color').value= '#'+('000000'+(def.color>>>0).toString(16)).slice(-6);
    document.getElementById('cc-radius').value= def.radius || 22;
    document.getElementById('cc-maxhp').value = def.stats?.maxHp ?? 120;
    document.getElementById('cc-maxen').value = def.stats?.maxEn ?? 100;
    document.getElementById('cc-accel').value = def.stats?.accel ?? 1800;
    document.getElementById('cc-speed').value = def.stats?.moveSpeed ?? 240;
    document.getElementById('cc-dash').value  = def.stats?.dashSpeed ?? 560;
    document.getElementById('cc-fric').value  = def.stats?.friction ?? 0.86;
    document.getElementById('cc-physatk').value = def.stats?.physAtk ?? 1;
    document.getElementById('cc-enatk').value  = def.stats?.energyAtk ?? 1;
    document.getElementById('cc-atkspd').value = def.stats?.attackSpeed ?? 1;
    document.getElementById('cc-castspd').value= def.stats?.castSpeed ?? 1;
    document.getElementById('cc-chanspd').value= def.stats?.channelSpeed ?? 1;
    document.getElementById('cc-physrng').value= def.stats?.physRange ?? 1;
    document.getElementById('cc-enrng').value = def.stats?.energyRange ?? 1;
    document.getElementById('cc-physdef').value= def.stats?.physDef ?? 0;
    document.getElementById('cc-endef').value = def.stats?.energyDef ?? 0;
    document.getElementById('cc-hpreg').value = def.stats?.hpRegen ?? 0;
    document.getElementById('cc-enreg').value = def.stats?.enRegen ?? 0;
    document.getElementById('cc-slots').value  = def.stats?.skillSlots ?? 4;
    document.getElementById('cc-special').value= def.stats?.special ?? '';
    document.getElementById('cc-stapow').value = def.stats?.statusPower ?? 0;
    document.getElementById('cc-stadur').value = def.stats?.statusDuration ?? 1;
    document.getElementById('cc-stares').value = def.stats?.statusResist ?? 0;
    document.getElementById('cc-stadurres').value = def.stats?.statusDurationResist ?? 1;
    const set = new Set(def.loadout||[]);
    document.getElementById('cc-skill-light').checked = set.has('light');
    document.getElementById('cc-skill-heavy').checked = set.has('heavy');
    document.getElementById('cc-skill-spin').checked  = set.has('spin');
    document.getElementById('cc-skill-heal').checked  = set.has('heal');
  }

  function emitCCUpdate(){
    ccState = currentCCDef();
    window.dispatchEvent(new CustomEvent('VC_CC_UPDATE', { detail:{ def: ccState }}));
  }

  function startCharCreatorPreviewFromSelection(){
    // Standard: nehme aktuell gewählten P1-Char als Vorlage
    const id = document.getElementById('p1char')?.value;
    const chars = window.GameData.characters || [];
    const def = chars.find(c=>c.id===id) || chars[0] || {
      id:'custom', name:'Custom', shape:'circle', color:0x64c8ff, radius:22,
      stats:{
        maxHp:120, maxEn:100,
        physAtk:1, energyAtk:1,
        attackSpeed:1, castSpeed:1, channelSpeed:1,
        physRange:1, energyRange:1,
        accel:1800, moveSpeed:240, dashSpeed:560, friction:0.86,
        physDef:0, energyDef:0,
        hpRegen:0, enRegen:0,
        skillSlots:4, special:null,
        statusPower:0, statusDuration:1, statusResist:0, statusDurationResist:1,
        damageScale:1.0
      },
      loadout:['light','heavy','spin','heal']
    };
    applyCCDefToForm(def);
    document.getElementById('cc-load').value = def.id;
    emitCCUpdate();
  }

    function bindCharCreatorUI(){
    // Eingaben -> Realtime Preview
    ['cc-name','cc-shape','cc-color','cc-radius','cc-maxhp','cc-maxen','cc-physatk','cc-enatk','cc-atkspd','cc-castspd','cc-chanspd',
     'cc-physrng','cc-enrng','cc-accel','cc-speed','cc-dash','cc-fric','cc-physdef','cc-endef','cc-hpreg','cc-enreg','cc-slots','cc-special',
     'cc-stapow','cc-stadur','cc-stares','cc-stadurres','cc-skill-light','cc-skill-heavy','cc-skill-spin','cc-skill-heal'
    ].forEach(id=>{
      const el = document.getElementById(id);
      el?.addEventListener('input', emitCCUpdate);
      el?.addEventListener('change', emitCCUpdate);
    });

    // Auswahl/CRUD
    document.getElementById('cc-load')?.addEventListener('change', ()=>{
      const id = document.getElementById('cc-load').value;
      const def = (window.GameData.characters||[]).find(c=>c.id===id);
      if (def){ applyCCDefToForm(def); emitCCUpdate(); }
    });

    document.getElementById('cc-new')?.addEventListener('click', ()=>{
      applyCCDefToForm({
        id:'custom', name:'Custom', shape:'circle', color:0x64c8ff, radius:22,
        stats:{
          maxHp:120, maxEn:100,
          physAtk:1, energyAtk:1,
          attackSpeed:1, castSpeed:1, channelSpeed:1,
          physRange:1, energyRange:1,
          accel:1800, moveSpeed:240, dashSpeed:560, friction:0.86,
          physDef:0, energyDef:0,
          hpRegen:0, enRegen:0,
          skillSlots:4, special:null,
          statusPower:0, statusDuration:1, statusResist:0, statusDurationResist:1,
          damageScale:1.0
        },
        loadout:['light','heavy','spin','heal']
      });
      emitCCUpdate();
    });

    document.getElementById('cc-duplicate')?.addEventListener('click', ()=>{
      const base = currentCCDef();
      base.id = (base.id+'_copy').slice(0,40);
      base.name = base.name + ' Copy';
      applyCCDefToForm(base);
      emitCCUpdate();
    });

    document.getElementById('cc-delete')?.addEventListener('click', ()=>{
      const id = currentCCDef().id;
      const arr = window.GameData.characters;
      const idx = arr.findIndex(c=>c.id===id);
      if (idx>=0){ arr.splice(idx,1); saveCharactersToLocal(); populateCharacterSelects(); startCharCreatorPreviewFromSelection(); }
    });

    document.getElementById('cc-save')?.addEventListener('click', ()=>{
      const def = currentCCDef();
      const arr = window.GameData.characters;
      const idx = arr.findIndex(c=>c.id===def.id);
      if (idx>=0) arr[idx]=def; else arr.push(def);
      saveCharactersToLocal();
      populateCharacterSelects();
      document.getElementById('cc-load').value = def.id;
    });

    document.getElementById('cc-use-p1')?.addEventListener('click', ()=>{
      const def = currentCCDef();
      const arr = window.GameData.characters;
      const idx = arr.findIndex(c=>c.id===def.id);
      if (idx>=0) arr[idx]=def; else arr.push(def);
      saveCharactersToLocal(); populateCharacterSelects();
      const p1sel = document.getElementById('p1char'); if (p1sel) p1sel.value = def.id;
      document.getElementById('btn-start')?.click();
      setActiveTab('tab-sim');
    });

    document.getElementById('cc-use-p2')?.addEventListener('click', ()=>{
      const def = currentCCDef();
      const arr = window.GameData.characters;
      const idx = arr.findIndex(c=>c.id===def.id);
      if (idx>=0) arr[idx]=def; else arr.push(def);
      saveCharactersToLocal(); populateCharacterSelects();
      const p2sel = document.getElementById('p2char'); if (p2sel) p2sel.value = def.id;
      document.getElementById('btn-start')?.click();
      setActiveTab('tab-sim');
    });

    document.getElementById('cc-export')?.addEventListener('click', ()=>{
      const blob = new Blob([JSON.stringify(window.GameData, null, 2)], {type:'application/json'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'characters.json'; a.click(); URL.revokeObjectURL(a.href);
    });
  }

  function saveCharactersToLocal(){
    try{ localStorage.setItem('vibecode_characters', JSON.stringify(window.GameData)); }catch(e){}
  }
  function loadCharactersFromLocal(){
    try{
      const s = localStorage.getItem('vibecode_characters');
      if (s){ const d = JSON.parse(s); if (d && Array.isArray(d.characters)) window.GameData = d; }
    }catch(e){}
  }

  // ----- Manager Mode -----
  let managerTeam1 = [];
  let managerTeam2 = [];

  function populateRoster(){
    const list = document.getElementById('roster-list');
    if (!list) return;

    const chars = window.GameData.characters || [];
    list.innerHTML = '';

    chars.forEach((char, idx) => {
      const card = document.createElement('div');
      card.className = 'fighter-card';
      card.dataset.charId = char.id;

      const colorBadge = `<span class="color-badge" style="background-color:#${char.color.toString(16).padStart(6,'0')}"></span>`;
      card.innerHTML = `
        <div class="name">${colorBadge}${char.name}</div>
        <div class="stats">
          <span class="stat">Lvl ${char.level || 1}</span>
          <span class="stat">HP ${char.stats?.maxHp || 100}</span>
          <span class="stat">ATK ${(char.stats?.physAtk || 1).toFixed(1)}</span>
          <span class="stat">SPD ${char.stats?.moveSpeed || 240}</span>
        </div>
      `;

      card.addEventListener('click', () => selectFighterForTeam(char.id));
      list.appendChild(card);
    });
  }

  function selectFighterForTeam(charId){
    // Find first empty slot
    const emptySlot = document.querySelector('.team-slot:not(.filled)');
    if (!emptySlot) {
      alert('Alle Team-Slots sind voll! Klicke auf einen Slot um ihn zu leeren.');
      return;
    }

    const char = window.GameData.characters.find(c => c.id === charId);
    if (!char) return;

    const team = emptySlot.dataset.team;
    const slot = emptySlot.dataset.slot;

    if (team === '1') {
      managerTeam1[slot] = char;
    } else {
      managerTeam2[slot] = char;
    }

    updateTeamSlot(emptySlot, char);
  }

  function updateTeamSlot(slotEl, char){
    if (!char) {
      slotEl.classList.remove('filled');
      slotEl.innerHTML = '<div class="empty-slot">Klick Fighter links zum Hinzufügen</div>';
    } else {
      slotEl.classList.add('filled');
      const colorBadge = `<span class="color-badge" style="background-color:#${char.color.toString(16).padStart(6,'0')}"></span>`;
      slotEl.innerHTML = `
        <div class="fighter-info">
          ${colorBadge}
          <div>
            <div class="name">${char.name}</div>
            <div class="level">Level ${char.level || 1}</div>
          </div>
        </div>
      `;
    }

    // Click to remove
    slotEl.onclick = () => {
      const team = slotEl.dataset.team;
      const slot = slotEl.dataset.slot;
      if (team === '1') managerTeam1[slot] = null;
      else managerTeam2[slot] = null;
      updateTeamSlot(slotEl, null);
    };
  }

  function bindManagerMode(){
    document.getElementById('btn-start-manager-match')?.addEventListener('click', startManagerMatch);
    document.getElementById('btn-back-to-roster')?.addEventListener('click', () => {
      document.getElementById('match-results').style.display = 'none';
      setActiveTab('tab-manager');
    });
  }

  function startManagerMatch(){
    const team1 = managerTeam1.filter(f => f);
    const team2 = managerTeam2.filter(f => f);

    if (team1.length === 0 || team2.length === 0) {
      alert('Beide Teams müssen mindestens 1 Fighter haben!');
      return;
    }

    // Switch to simulator and start match with selected teams
    setActiveTab('tab-sim');
    window.dispatchEvent(new CustomEvent('VC_START_MANAGER_MATCH', {
      detail: { team1, team2 }
    }));
  }

  // ----- Boot -----
  window.addEventListener('load', async ()=>{
    // Daten laden
    try{
      const resp = await fetch('data/characters.json');
      if (resp.ok){
        window.GameData = await resp.json();
      }
    }catch(e){ console.warn('characters.json konnte nicht geladen werden, benutze Defaults'); }
    // ggf. lokale Persistenz überschreibt
    loadCharactersFromLocal();

    populateCharacterSelects();
    bindHeader();
    setupSkillButtons();
    bindCharCreatorUI();
    bindManagerMode();
    initHUDWindow();

    // Start Game
    new Phaser.Game(config);

    // Auto-Start
    setTimeout(()=>document.getElementById('btn-start')?.click(), 350);
  });

})();
