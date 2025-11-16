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

      // Control game canvas pointer events - disable for UI-heavy tabs
      const gameRoot = document.getElementById('game-root');
      if (gameRoot) {
        if (id === 'tab-sim') {
          gameRoot.style.pointerEvents = 'auto';
        } else {
          gameRoot.style.pointerEvents = 'none';
        }
      }

      let mode = 'simulator';
      if (id === 'tab-sim'){
        document.getElementById('panel-sim-left').style.display='block';
        document.getElementById('panel-sim-right').style.display='block';
        mode = 'simulator';
      } else if (id === 'tab-char'){
        document.getElementById('panel-char-left').style.display='block';
        document.getElementById('panel-char-right').style.display='block';
        populateCharCreatorList();
        // Ensure skill selector is populated
        if (!document.querySelector('.cc-skill-checkbox')){
          populateSkillLoadoutSelector();
        }
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

    // Speed Control Buttons
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const speed = parseInt(btn.dataset.speed);
        setGameSpeed(speed);
        document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  function setGameSpeed(speed){
    window.dispatchEvent(new CustomEvent('VC_SET_GAME_SPEED', { detail: { speed } }));
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


  // ----- Character Creator -----
  let ccCurrentCharId = null;
  let ccEditMode = false;

  function bindCharCreatorUI(){
    populateCharCreatorList();
    populateSkillLoadoutSelector();

    // Personality sliders - update value display
    ['agg', 'team', 'risk', 'pos', 'energy'].forEach(trait => {
      const slider = document.getElementById(`cc-pers-${trait}`);
      const valSpan = document.getElementById(`cc-pers-${trait}-val`);
      if (slider && valSpan){
        slider.addEventListener('input', () => {
          valSpan.textContent = slider.value;
        });
      }
    });

    // New character button
    document.getElementById('cc-new-char')?.addEventListener('click', () => {
      ccCurrentCharId = null;
      ccEditMode = false;
      clearCharCreatorForm();
      showCharCreatorForm(true);
      document.getElementById('cc-form-title').textContent = 'Neuen Charakter erstellen';
    });

    // Save button
    document.getElementById('cc-save')?.addEventListener('click', saveCharacter);

    // Cancel button
    document.getElementById('cc-cancel')?.addEventListener('click', () => {
      showCharCreatorForm(false);
      ccCurrentCharId = null;
      ccEditMode = false;
    });
  }

  function populateCharCreatorList(){
    const list = document.getElementById('cc-char-list');
    if (!list) {
      console.warn('[CharCreator] cc-char-list element not found');
      return;
    }

    const chars = window.GameData.characters || [];
    list.innerHTML = '';
    console.log('[CharCreator] Populating list with', chars.length, 'characters');

    chars.forEach((char, index) => {
      const card = document.createElement('div');
      card.className = 'fighter-card';
      card.style.cursor = 'pointer';
      card.style.userSelect = 'none';
      card.dataset.charId = char.id;

      const roleInfo = getRoleInfo(char.role);
      const colorBadge = `<span class="color-badge" style="background-color:#${char.color.toString(16).padStart(6,'0')}"></span>`;

      card.innerHTML = `
        <div class="name">${colorBadge}${char.name} <span style="color:${roleInfo.color};">${roleInfo.icon}</span></div>
        <div class="stats">
          <span class="stat">Lvl ${char.level || 1}</span>
          <span class="stat">HP ${char.stats?.maxHp || 100}</span>
          <span class="stat">${roleInfo.symbol}</span>
        </div>
      `;

      // Use onclick property for more reliable event handling
      const charIdCopy = char.id; // Capture in closure
      card.onclick = function(e) {
        console.log('[CharCreator] Card clicked!', charIdCopy, e);
        e.stopPropagation();
        loadCharacterForEdit(charIdCopy);
      };

      list.appendChild(card);
      console.log('[CharCreator] Card added:', index, char.name, char.id);
    });

    console.log('[CharCreator] List populated. Total cards:', list.children.length);

    // Test: Add a click listener to the list itself to see if ANY clicks are detected
    list.onclick = function(e) {
      console.log('[CharCreator] List container clicked, target:', e.target);
    };
  }

  function loadCharacterForEdit(charId){
    console.log('[CharCreator] loadCharacterForEdit called with:', charId);
    const char = window.GameData.characters.find(c => c.id === charId);
    if (!char) {
      console.error('[CharCreator] Character not found:', charId);
      return;
    }

    console.log('[CharCreator] Loading character:', char.name);
    ccCurrentCharId = charId;
    ccEditMode = true;

    // Send preview to arena
    window.dispatchEvent(new CustomEvent('VC_CC_UPDATE', { detail: { def: char } }));

    // Ensure skill selector is populated
    if (!document.querySelector('.cc-skill-checkbox')){
      console.log('[CharCreator] Skill selector not found, populating...');
      populateSkillLoadoutSelector();
    }

    // Load data into form
    document.getElementById('cc-name').value = char.name || '';
    document.getElementById('cc-role').value = char.role || 'Aggressive';
    document.getElementById('cc-color').value = '#' + (char.color || 0x64c8ff).toString(16).padStart(6, '0');
    document.getElementById('cc-level').value = char.level || 1;

    // Personality
    const pers = char.personality || {};
    setSliderValue('cc-pers-agg', pers.aggression || 5);
    setSliderValue('cc-pers-team', pers.teamplay || 5);
    setSliderValue('cc-pers-risk', pers.riskTaking || 5);
    setSliderValue('cc-pers-pos', pers.positioning || 5);
    setSliderValue('cc-pers-energy', pers.energyManagement || 5);

    // Stats
    const stats = char.stats || {};
    document.getElementById('cc-maxhp').value = stats.maxHp || 100;
    document.getElementById('cc-maxen').value = stats.maxEn || 100;
    document.getElementById('cc-physatk').value = stats.physAtk || 1;
    document.getElementById('cc-physdef').value = stats.physDef || 0;
    document.getElementById('cc-enatk').value = stats.energyAtk || 1;
    document.getElementById('cc-endef').value = stats.energyDef || 0;
    document.getElementById('cc-speed').value = stats.moveSpeed || 240;
    document.getElementById('cc-dash').value = stats.dashSpeed || 560;
    document.getElementById('cc-hpreg').value = stats.hpRegen || 0;
    document.getElementById('cc-enreg').value = stats.enRegen || 0;

    // Loadout
    const loadout = char.loadout || [];
    console.log('[CharCreator] Setting loadout:', loadout);
    const checkboxes = document.querySelectorAll('.cc-skill-checkbox');
    console.log('[CharCreator] Found', checkboxes.length, 'checkboxes');
    checkboxes.forEach(cb => {
      cb.checked = loadout.includes(cb.dataset.skillId);
    });

    showCharCreatorForm(true);
    document.getElementById('cc-form-title').textContent = `Editieren: ${char.name}`;
    console.log('[CharCreator] Form displayed');
  }

  function setSliderValue(id, value){
    const slider = document.getElementById(id);
    const valSpan = document.getElementById(id + '-val');
    if (slider){
      slider.value = value;
      if (valSpan) valSpan.textContent = value;
    }
  }

  function clearCharCreatorForm(){
    document.getElementById('cc-name').value = '';
    document.getElementById('cc-role').value = 'Aggressive';
    document.getElementById('cc-color').value = '#64c8ff';
    document.getElementById('cc-level').value = 1;

    setSliderValue('cc-pers-agg', 5);
    setSliderValue('cc-pers-team', 5);
    setSliderValue('cc-pers-risk', 5);
    setSliderValue('cc-pers-pos', 5);
    setSliderValue('cc-pers-energy', 5);

    document.getElementById('cc-maxhp').value = 100;
    document.getElementById('cc-maxen').value = 100;
    document.getElementById('cc-physatk').value = 1;
    document.getElementById('cc-physdef').value = 0;
    document.getElementById('cc-enatk').value = 1;
    document.getElementById('cc-endef').value = 0;
    document.getElementById('cc-speed').value = 240;
    document.getElementById('cc-dash').value = 560;
    document.getElementById('cc-hpreg').value = 0;
    document.getElementById('cc-enreg').value = 0;

    document.querySelectorAll('.cc-skill-checkbox').forEach(cb => cb.checked = false);
  }

  function showCharCreatorForm(show){
    document.getElementById('cc-form').style.display = show ? 'block' : 'none';
    document.getElementById('cc-placeholder').style.display = show ? 'none' : 'block';
  }

  function populateSkillLoadoutSelector(){
    const container = document.getElementById('cc-loadout-selector');
    if (!container) return;

    // We'll use the skills from the defaultMoves in Fighter.js
    const availableSkills = [
      'slash', 'power_strike', 'whirlwind', 'dash_strike',
      'poke', 'snipe', 'shield_bash', 'retreat',
      'ground_slam', 'punch',
      'guard', 'area_heal', 'quick_heal', 'self_heal', 'fortify'
    ];

    container.innerHTML = '';
    availableSkills.forEach(skillId => {
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '8px';
      label.style.padding = '4px';
      label.style.cursor = 'pointer';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'cc-skill-checkbox';
      checkbox.dataset.skillId = skillId;

      const skillName = skillId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const skillNameSpan = document.createElement('span');
      skillNameSpan.style.flex = '1';
      skillNameSpan.textContent = skillName;

      // Limit to 4 skills
      checkbox.addEventListener('change', (e) => {
        const checked = document.querySelectorAll('.cc-skill-checkbox:checked');
        if (checked.length > 4){
          e.target.checked = false;
          alert('Maximal 4 Skills erlaubt!');
        }
      });

      label.appendChild(checkbox);
      label.appendChild(skillNameSpan);
      container.appendChild(label);
    });
  }

  function saveCharacter(){
    const name = document.getElementById('cc-name').value.trim();
    if (!name){
      alert('Bitte gib einen Namen ein!');
      return;
    }

    // Collect loadout
    const loadout = Array.from(document.querySelectorAll('.cc-skill-checkbox:checked'))
      .map(cb => cb.dataset.skillId);

    if (loadout.length === 0){
      alert('Bitte wähle mindestens 1 Skill aus!');
      return;
    }

    const colorHex = document.getElementById('cc-color').value;
    const color = parseInt(colorHex.substring(1), 16);

    const charData = {
      id: ccEditMode ? ccCurrentCharId : generateCharId(name),
      name: name,
      role: document.getElementById('cc-role').value,
      shape: 'circle',
      color: color,
      radius: 22,
      level: parseInt(document.getElementById('cc-level').value) || 1,
      xp: 0,
      trainingPoints: 0,
      personality: {
        aggression: parseInt(document.getElementById('cc-pers-agg').value),
        teamplay: parseInt(document.getElementById('cc-pers-team').value),
        riskTaking: parseInt(document.getElementById('cc-pers-risk').value),
        positioning: parseInt(document.getElementById('cc-pers-pos').value),
        energyManagement: parseInt(document.getElementById('cc-pers-energy').value)
      },
      items: [],
      stats: {
        maxHp: parseFloat(document.getElementById('cc-maxhp').value) || 100,
        maxEn: parseFloat(document.getElementById('cc-maxen').value) || 100,
        physAtk: parseFloat(document.getElementById('cc-physatk').value) || 1,
        energyAtk: parseFloat(document.getElementById('cc-enatk').value) || 1,
        attackSpeed: 1,
        castSpeed: 1,
        channelSpeed: 1,
        physRange: 1,
        energyRange: 1,
        accel: 1800,
        moveSpeed: parseFloat(document.getElementById('cc-speed').value) || 240,
        dashSpeed: parseFloat(document.getElementById('cc-dash').value) || 560,
        friction: 0.86,
        physDef: parseFloat(document.getElementById('cc-physdef').value) || 0,
        energyDef: parseFloat(document.getElementById('cc-endef').value) || 0,
        hpRegen: parseFloat(document.getElementById('cc-hpreg').value) || 0,
        enRegen: parseFloat(document.getElementById('cc-enreg').value) || 0,
        skillSlots: 4,
        special: null,
        statusPower: 0,
        statusDuration: 1,
        statusResist: 0,
        statusDurationResist: 1,
        damageScale: 1.0
      },
      loadout: loadout
    };

    const chars = window.GameData.characters || [];
    if (ccEditMode){
      const idx = chars.findIndex(c => c.id === ccCurrentCharId);
      if (idx >= 0){
        chars[idx] = charData;
      }
    } else {
      chars.push(charData);
    }

    window.GameData.characters = chars;
    saveCharactersToLocal();
    populateCharacterSelects();
    populateCharCreatorList();
    populateRoster();

    showCharCreatorForm(false);
    ccCurrentCharId = null;
    ccEditMode = false;

    alert(`Charakter "${name}" wurde gespeichert!`);
  }

  function generateCharId(name){
    return name.toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20) + '_' + Date.now().toString(36);
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

  // Role icons and colors
  function getRoleInfo(role){
    const roleMap = {
      'Aggressive': { icon: '⚔', color: '#ff5555', name: 'Aggressive', symbol: 'AGG' },
      'Support': { icon: '✦', color: '#77ddff', name: 'Support', symbol: 'SUP' },
      'Tank': { icon: '▣', color: '#ffaa55', name: 'Tank', symbol: 'TNK' },
      'Assassin': { icon: '⚡', color: '#ff88ff', name: 'Assassin', symbol: 'ASN' }
    };
    return roleMap[role] || { icon: '?', color: '#888888', name: role || 'Unknown', symbol: '???' };
  }

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

      // Role badge
      const roleInfo = getRoleInfo(char.role);
      const roleBadge = `<span style="font-size:14px; margin-left:4px;" title="${roleInfo.name}">${roleInfo.icon}</span>`;

      // Show equipped items
      let itemBadges = '';
      const equippedItems = (char.items || []).filter(id => id);
      if (equippedItems.length > 0){
        const itemDefs = window.GameData.items || [];
        itemBadges = '<div style="margin-top:4px; display:flex; gap:3px;">';
        equippedItems.forEach(itemId => {
          const item = itemDefs.find(it => it.id === itemId);
          if (item){
            const itemColor = `#${item.color.toString(16).padStart(6,'0')}`;
            itemBadges += `<span style="width:6px; height:6px; border-radius:50%; background:${itemColor}; display:inline-block;" title="${item.name}"></span>`;
          }
        });
        itemBadges += '</div>';
      }

      card.innerHTML = `
        <div class="name">${colorBadge}${char.name}${roleBadge}</div>
        <div class="stats">
          <span class="stat">Lvl ${char.level || 1}</span>
          <span class="stat">HP ${char.stats?.maxHp || 100}</span>
          <span class="stat">ATK ${(char.stats?.physAtk || 1).toFixed(1)}</span>
          <span class="stat">SPD ${char.stats?.moveSpeed || 240}</span>
        </div>
        ${itemBadges}
      `;

      card.addEventListener('click', () => showItemManager(char.id));
      card.addEventListener('dblclick', () => selectFighterForTeam(char.id));
      list.appendChild(card);
    });
  }

  // === Item Management ===
  let selectedFighterForItems = null;

  function showItemManager(charId){
    const char = window.GameData.characters.find(c => c.id === charId);
    if (!char) return;

    selectedFighterForItems = charId;
    const section = document.getElementById('item-manager-section');
    const nameSpan = document.getElementById('selected-fighter-name');
    const infoSpan = document.getElementById('selected-fighter-info');

    if (!section || !nameSpan) return;

    nameSpan.textContent = char.name;

    // Show role and level info
    if (infoSpan){
      const roleInfo = getRoleInfo(char.role);
      infoSpan.innerHTML = `<span style="color:${roleInfo.color};">${roleInfo.icon} ${roleInfo.name}</span> • Level ${char.level || 1} • HP ${char.stats?.maxHp || 100} • ATK ${(char.stats?.physAtk || 1).toFixed(1)}`;
    }

    section.style.display = 'block';

    // Highlight selected fighter in roster
    document.querySelectorAll('.fighter-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.fighter-card[data-char-id="${charId}"]`)?.classList.add('selected');

    updateEquippedSlots(char);
    populateAvailableItems(char);
  }

  function updateEquippedSlots(char){
    const slotsContainer = document.getElementById('equipped-slots');
    if (!slotsContainer) return;

    const items = char.items || [];
    const itemDefs = window.GameData.items || [];

    for (let slot = 0; slot < 3; slot++){
      const slotEl = slotsContainer.querySelector(`.item-slot[data-slot="${slot}"]`);
      if (!slotEl) continue;

      const itemId = items[slot];
      if (itemId){
        const itemDef = itemDefs.find(it => it.id === itemId);
        if (itemDef){
          slotEl.classList.add('filled');
          slotEl.innerHTML = `
            <div class="item-badge" style="background-color:#${itemDef.color.toString(16).padStart(6,'0')}33;">
              <div class="item-name">${itemDef.name}</div>
              <div class="item-type">${itemDef.slot}</div>
            </div>
            <button class="unequip-btn" onclick="unequipItem('${char.id}', ${slot})">×</button>
          `;
        }
      } else {
        slotEl.classList.remove('filled');
        slotEl.innerHTML = `<div class="empty-item-slot">Slot ${slot + 1}</div>`;
        slotEl.onclick = () => {}; // Clear any previous handlers
      }
    }
  }

  function populateAvailableItems(char){
    const container = document.getElementById('available-items');
    if (!container) return;

    const items = window.GameData.items || [];
    const equippedItems = char.items || [];

    container.innerHTML = '';

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = `item-card rarity-${item.rarity || 'common'}`;
      if (equippedItems.includes(item.id)){
        card.classList.add('equipped');
      }

      const iconColor = `#${item.color.toString(16).padStart(6,'0')}`;
      card.innerHTML = `
        <div class="item-header">
          <div class="item-icon" style="background-color:${iconColor};"></div>
          <div class="item-name">${item.name}</div>
          <div class="item-slot-type">${item.slot}</div>
        </div>
        <div class="item-desc">${item.description}</div>
      `;

      card.addEventListener('click', () => {
        if (!equippedItems.includes(item.id)){
          tryEquipItem(char.id, item.id);
        }
      });

      container.appendChild(card);
    });
  }

  function tryEquipItem(charId, itemId){
    const char = window.GameData.characters.find(c => c.id === charId);
    if (!char) return;

    // Initialize items array if needed
    if (!char.items) char.items = [];

    // Find first empty slot
    let emptySlot = -1;
    for (let i = 0; i < 3; i++){
      if (!char.items[i]){
        emptySlot = i;
        break;
      }
    }

    if (emptySlot === -1){
      alert('Alle Equipment-Slots sind voll! Entferne zuerst ein Item.');
      return;
    }

    // Equip item
    char.items[emptySlot] = itemId;
    saveCharactersToLocal();
    showItemManager(charId); // Refresh display
  }

  window.unequipItem = function(charId, slot){
    const char = window.GameData.characters.find(c => c.id === charId);
    if (!char) return;

    if (!char.items) char.items = [];
    char.items[slot] = null;

    saveCharactersToLocal();
    showItemManager(charId); // Refresh display
  };

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

      // Show equipped items
      let itemIndicators = '';
      const equippedItems = (char.items || []).filter(id => id);
      if (equippedItems.length > 0){
        const itemDefs = window.GameData.items || [];
        itemIndicators = '<div style="margin-top:4px; display:flex; gap:3px;">';
        equippedItems.forEach(itemId => {
          const item = itemDefs.find(it => it.id === itemId);
          if (item){
            const itemColor = `#${item.color.toString(16).padStart(6,'0')}`;
            itemIndicators += `<span style="width:8px; height:8px; border-radius:50%; background:${itemColor}; display:inline-block;" title="${item.name}"></span>`;
          }
        });
        itemIndicators += '</div>';
      }

      slotEl.innerHTML = `
        <div class="fighter-info">
          ${colorBadge}
          <div>
            <div class="name">${char.name}</div>
            <div class="level">Level ${char.level || 1}</div>
            ${itemIndicators}
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

    window.addEventListener('VC_MATCH_END', (ev) => {
      const data = ev.detail || {};
      showMatchResults(data);
    });
  }

  function showMatchResults(data){
    const { winner, loser, duration, stats, xpGains } = data;
    const resultDiv = document.getElementById('result-content');
    const resultsPanel = document.getElementById('match-results');

    if (!resultDiv || !resultsPanel) return;

    // Format duration
    const durationSec = (duration / 1000).toFixed(1);

    // Build stats table
    let html = `
      <div style="text-align:center; margin-bottom:12px;">
        <h2 style="color:#00ff88; margin:8px 0;">🏆 ${winner} gewinnt!</h2>
        <div style="font-size:11px; opacity:0.7;">Match Dauer: ${durationSec}s</div>
      </div>

      <h4 style="margin:12px 0 8px 0; font-size:12px; color:#7ad7ff;">Match Statistiken:</h4>
      <table style="width:100%; font-size:11px; border-collapse:collapse;">
        <tr style="border-bottom:1px solid #2b2b36;">
          <th style="text-align:left; padding:4px;">Fighter</th>
          <th style="text-align:center; padding:4px;">DMG</th>
          <th style="text-align:center; padding:4px;">Kills</th>
          <th style="text-align:center; padding:4px;">XP</th>
        </tr>
    `;

    Object.keys(stats).forEach(fighterId => {
      const s = stats[fighterId];
      const xp = xpGains[fighterId];
      const levelUp = xp && xp.leveledUp ? ` ⬆️ Lvl ${xp.newLevel}` : '';
      html += `
        <tr style="border-bottom:1px solid #2b2b36;">
          <td style="padding:4px;">${s.name}</td>
          <td style="text-align:center; padding:4px;">${Math.round(s.damageDealt)}</td>
          <td style="text-align:center; padding:4px;">${s.kills}</td>
          <td style="text-align:center; padding:4px; ${levelUp ? 'color:#00ff88; font-weight:600;' : ''}">
            +${xp ? xp.xp : 0}${levelUp}
          </td>
        </tr>
      `;
    });

    html += `</table>`;

    resultDiv.innerHTML = html;
    resultsPanel.style.display = 'block';

    // Switch to Manager tab to show results
    setTimeout(() => setActiveTab('tab-manager'), 500);
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

    // Items laden
    try{
      const resp = await fetch('data/items.json');
      if (resp.ok){
        const itemsData = await resp.json();
        window.GameData.items = itemsData.items || [];
        console.log('[Main] Loaded', window.GameData.items.length, 'items');
      }
    }catch(e){ console.warn('items.json konnte nicht geladen werden'); }

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
