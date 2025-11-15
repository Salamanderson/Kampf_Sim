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

  // Tactical AI System with scoring
  function evaluateAction(action, me, enemy, dist, cds, profile){
    let score = 0;
    const myHpPct = me.hp / me.maxHp;
    const enemyHpPct = enemy.hp / me.maxHp; // Using me.maxHp as baseline
    const inCombatRange = dist < 100;
    const inAttackRange = dist < 80;
    const isAggressive = profile === 'aggressive';
    const isDefensive = profile === 'defensive';

    switch(action){
      case 'heal':
        if (cds.heal > 0) return -1000; // Can't use
        if (me.en < 25) return -1000; // Not enough energy
        // Heal priority based on HP
        if (myHpPct < 0.25) score = 1000; // Critical HP - highest priority
        else if (myHpPct < 0.40) score = 600; // Low HP - high priority
        else if (myHpPct < 0.60) score = 300; // Medium HP - moderate priority
        else score = -500; // High HP - don't waste
        // Defensive AI heals more aggressively
        if (isDefensive) score *= 1.3;
        // Don't heal if enemy is very close and can punish
        if (inAttackRange) score -= 400;
        break;

      case 'dash':
        if (cds.dash > 0) return -1000; // Can't use
        // Dash to close distance
        if (dist > 200) score = 400;
        else if (dist > 150) score = 200;
        else score = -200; // Too close for dash
        // Aggressive uses dash more
        if (isAggressive) score *= 1.5;
        break;

      case 'spin':
        if (cds.spin > 0) return -1000; // Can't use
        // Spin is best when enemy is very close (AoE around self)
        if (dist < 60) score = 800; // Perfect range
        else if (dist < 100) score = 400; // Good range
        else if (dist < 140) score = 100; // Okay range
        else score = -500; // Too far
        // Bonus if low HP (desperation move)
        if (myHpPct < 0.3) score += 200;
        break;

      case 'attack_heavy':
        if (cds.heavy > 0) return -1000; // Can't use
        // Heavy is good for burst damage at medium range
        if (dist < 70) score = 600; // Good range
        else if (dist < 110) score = 400; // Acceptable
        else score = -200; // Too far
        // Use heavy to finish low HP enemies
        if (enemyHpPct < 0.3) score += 400;
        // Aggressive uses heavy more
        if (isAggressive) score *= 1.3;
        break;

      case 'attack_light':
        // Light attack is always available, safe poke
        if (dist < 60) score = 500; // Close range
        else if (dist < 90) score = 400; // Good range
        else if (dist < 120) score = 200; // Max range
        else score = -100; // Too far
        // Safe option for defensive
        if (isDefensive) score *= 1.2;
        break;

      case 'move_towards':
        // Approach if out of range
        if (dist > 150) score = 500;
        else if (dist > 100) score = 300;
        else score = 50; // Already close
        // Aggressive approaches more
        if (isAggressive) score *= 1.4;
        // Don't approach if low HP
        if (myHpPct < 0.3) score -= 300;
        break;

      case 'move_away':
        // Retreat when low HP or too close
        if (myHpPct < 0.3) score = 600; // Low HP - retreat
        else if (dist < 60) score = 400; // Too close
        else if (dist < 100) score = 200; // Close
        else score = -200; // Don't retreat if far
        // Defensive retreats more
        if (isDefensive) score *= 1.5;
        break;

      case 'strafe_left':
      case 'strafe_right':
        // Strafe for repositioning at medium range
        if (dist > 80 && dist < 160) score = 300;
        else if (dist < 80) score = 400; // Dodge at close range
        else score = 100;
        // Defensive strafes more
        if (isDefensive) score *= 1.3;
        break;

      case 'idle':
        score = -100; // Generally don't idle
        break;
    }

    return score;
  }

  function jsFallbackAI(profileId, s){
    const me = s.self, e = s.closestEnemy;
    if (!e) return 'idle';
    const dx = e.x - me.x, dy = e.y - me.y;
    const dist = Math.hypot(dx, dy);
    const cds = s.cooldowns;

    // Evaluate all possible actions
    const actions = ['heal', 'dash', 'spin', 'attack_heavy', 'attack_light',
                     'move_towards', 'move_away', 'strafe_left', 'strafe_right'];

    let bestAction = 'idle';
    let bestScore = -Infinity;

    for (const action of actions){
      let score = evaluateAction(action, me, e, dist, cds, profileId);
      // Add small random variation (±10%) for dynamic behavior
      if (score > -1000){
        score *= (0.95 + Math.random() * 0.1);
      }
      if (score > bestScore){
        bestScore = score;
        bestAction = action;
      }
    }

    return bestAction;
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
      } else if (id === 'tab-story'){
        document.getElementById('panel-story-left').style.display='block';
        document.getElementById('panel-story-right').style.display='block';
        mode = 'story';
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

    document.getElementById('tab-sim')?.addEventListener('click', ()=>setActiveTab('tab-sim'));
    document.getElementById('tab-story')?.addEventListener('click', ()=>setActiveTab('tab-story'));
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
        damageScale: 1.0,
        accel: parseFloat(document.getElementById('cc-accel').value||'1800'),
        moveSpeed: parseFloat(document.getElementById('cc-speed').value||'240'),
        dashSpeed: parseFloat(document.getElementById('cc-dash').value||'560'),
        friction: parseFloat(document.getElementById('cc-fric').value||'0.86')
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
      stats:{ maxHp:120, maxEn:100, damageScale:1.0, accel:1800, moveSpeed:240, dashSpeed:560, friction:0.86 },
      loadout:['light','heavy','spin','heal']
    };
    applyCCDefToForm(def);
    document.getElementById('cc-load').value = def.id;
    emitCCUpdate();
  }

    function bindCharCreatorUI(){
    // Eingaben -> Realtime Preview
    ['cc-name','cc-shape','cc-color','cc-radius','cc-maxhp','cc-maxen','cc-accel','cc-speed','cc-dash','cc-fric',
     'cc-skill-light','cc-skill-heavy','cc-skill-spin','cc-skill-heal'
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
        stats:{ maxHp:120, maxEn:100, damageScale:1.0, accel:1800, moveSpeed:240, dashSpeed:560, friction:0.86 },
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
      initHUDWindow();

    // Start Game
    new Phaser.Game(config);

    // Auto-Start
    setTimeout(()=>document.getElementById('btn-start')?.click(), 350);
  });

})();
