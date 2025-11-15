// FILE: js/scenes/FightScene.js
(function(){
  const { Fighter } = window.Engine;
  const { HitboxSystem } = window.Engine;
  const { FeelSystem } = window.Engine;

  // Layout (muss zur index.html passen)
  const GAME_W = 1280, GAME_H = 720;
  const HEADER_H = 56, SIDE_W = 260, MARGIN = 16, LOG_H = 140;

  function computeArena(){
    const leftBlock  = MARGIN + SIDE_W + MARGIN;
    const rightBlock = MARGIN + SIDE_W + MARGIN;
    const topBlock   = HEADER_H + MARGIN;
    const bottomBlock= MARGIN + LOG_H + MARGIN;
    const w = GAME_W - (leftBlock + rightBlock);
    const h = GAME_H - (topBlock + bottomBlock);
    const x = leftBlock + w/2;
    const y = topBlock + h/2;
    const logY = topBlock + h + MARGIN + LOG_H/2;
    return { x, y, w, h, log:{ x, y:logY, w, h:LOG_H } };
  }

  const FightScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function FightScene(){
      Phaser.Scene.call(this, { key: 'FightScene' });
        this._uiOpts = { showHit:false, showDebug:false, useBrython:true, p1:'aggressive', p2:'defensive', p1CharId:null, p2CharId:null };
      this._mode = 'simulator'; // simulator | story | char_creator | skill_creator | ai_creator
      this._paused = false;
      this._ccPreview = null;
      this._matchEnded = false;
    },

    create: function(){
      this.cameras.main.setBackgroundColor('#0f0f16');
      this.arena = computeArena();

      // Arena zeichnen
      this._arenaGfx = this.add.graphics().setDepth(-2);
      this._drawArena();

      // Log-Fenster
      this._logGfx = this.add.graphics().setDepth(-2);
      this._logText = this.add.text(this.arena.log.x - this.arena.log.w/2 + 8, this.arena.log.y - this.arena.log.h/2 + 6, '', { fontSize:12, color:'#dfe6ff', wordWrap:{ width: this.arena.log.w - 16 } }).setDepth(10);
      this._logBuffer = [];
      this._drawLogFrame();

        // HUD (DOM)
        this._hudEl = document.getElementById('hud-content');
        this._hudWin = document.getElementById('hud-window');

      // Systeme
      this.hitboxes = new HitboxSystem(this);
      this.feel = new FeelSystem(this);

      // UI-Events
      window.addEventListener('VC_RESTART_MATCH', (ev)=>{
        const d = ev.detail || {};
        this._uiOpts = {
          showHit:!!d.showHit, showDebug:!!d.showDebug, useBrython:!!d.useBrython,
          p1:d.p1||'aggressive', p2:d.p2||'defensive',
          p1CharId:d.p1CharId||null, p2CharId:d.p2CharId||null
        };
        if (this._mode==='simulator') this.restartMatch();
      });

      window.addEventListener('VC_SET_MODE', (ev)=>{
        const m = ev.detail?.mode || 'simulator';
        this._setMode(m);
      });

      window.addEventListener('VC_FORCE_SKILL', (ev)=>{
        if (this._mode!=='simulator') return;
        const d = ev.detail||{}; const side = d.side, skill = d.skill;
        const f = side==='P1' ? this.fighters?.find(o=>o.teamId===1) : this.fighters?.find(o=>o.teamId===2);
        if (!f || f.ko) return;
        if (skill==='heal') f.tryHeal(); else f.tryAttack(skill);
      });

      window.addEventListener('VC_CC_UPDATE', (ev)=>{
        if (this._mode!=='char_creator') return;
        const def = ev.detail?.def; if (!def) return;
        this._updateCCPreview(def);
      });

      // Event-Bus aus Fighter/HitboxSystem
      this.events.on('skill_used',  (info)=>this._onSkillUsed(info));
      this.events.on('heal_used',   (info)=>this._onHealUsed(info));
      this.events.on('hit',         (info)=>this._onHit(info));
      this.events.on('ko',          (info)=>this._onKO(info));

      this.restartMatch();
    },

    _setMode: function(mode){
      this._mode = mode;
      if (mode==='simulator'){
        this._paused = false;
        // Vorschau entfernen, Fighter wieder zeigen
        if (this._ccPreview){ this._ccPreview.destroy(); this._ccPreview = null; }
        this.fighters?.forEach(f=>{ f.node?.setVisible(true); f._hpBg?.setVisible(true); f._hpFill?.setVisible(true); });
      } else if (mode==='char_creator'){
        // Kampf pausieren und Fighter verstecken
        this._paused = true;
        this.fighters?.forEach(f=>{ f.node?.setVisible(false); f._hpBg?.setVisible(false); f._hpFill?.setVisible(false); });
        // Eine Vorschau initialisieren aus aktuellem P1
        const chars = (window.GameData && window.GameData.characters) ? window.GameData.characters : [];
        const selId = document.getElementById('p1char')?.value;
        const def = chars.find(c=>c.id===selId) || chars[0];
        if (def) this._createCCPreview(def);
      } else {
        // Andere Modi: Kampf pausiert, aber Fighter sichtbar (Hintergrund)
        this._paused = true;
        if (this._ccPreview){ this._ccPreview.destroy(); this._ccPreview=null; }
        this.fighters?.forEach(f=>{ f.node?.setVisible(true); f._hpBg?.setVisible(true); f._hpFill?.setVisible(true); });
      }
    },

    _createCCPreview: function(def){
      if (this._ccPreview){ this._ccPreview.destroy(); this._ccPreview=null; }
      const A = this.arena;
      const cfg = Object.assign({}, def, { id:'PREVIEW', teamId:99, x: A.x, y: A.y, controllerProfile:'aggressive' });
      this._ccPreview = new Fighter(this, cfg);
    },
    _updateCCPreview: function(def){
      // Einfach neu erstellen (sauber für Form/Radius/Stats)
      this._createCCPreview(def);
    },

    _drawArena: function(){
      const g = this._arenaGfx; const A = this.arena;
      g.clear();
      g.fillStyle(0x1d1d2a, 1).fillRect(A.x-A.w/2, A.y-A.h/2, A.w, A.h);
      g.lineStyle(3, 0x00aaff, 1).strokeRect(A.x-A.w/2, A.y-A.h/2, A.w, A.h);
    },

    _drawLogFrame: function(){
      const g = this._logGfx; const L = this.arena.log;
      g.clear();
      g.fillStyle(0x14141c, 1).fillRect(L.x-L.w/2, L.y-L.h/2, L.w, L.h);
      g.lineStyle(2, 0x2b2b36, 1).strokeRect(L.x-L.w/2, L.y-L.h/2, L.w, L.h);
      this.add.text(L.x, L.y - L.h/2 - 12, 'Debug/Log', { fontSize:12, color:'#9fb3ff' }).setOrigin(0.5,1).setDepth(10);
    },

    log: function(msg){
      const t = `[${(this.game.loop.frame|0)}] ${msg}`;
      this._logBuffer.push(t);
      if (this._logBuffer.length > 10) this._logBuffer.shift();
      this._logText.setText(this._logBuffer.join('\n'));
    },

    restartMatch: function(){
      // Aufräumen
      if (this.fighters){ this.fighters.forEach(f=>{ f._hpBg?.destroy(); f._hpFill?.destroy(); f.destroy(); }); }
      this.fighters = [];
      this._matchEnded = false;

      // Charaktere laden
      const chars = (window.GameData && window.GameData.characters) ? window.GameData.characters : [];

      // Team Setup (für jetzt: 2v2 mit fest definierten Teams)
      const { Team } = window.Engine;

      // Team 1 (Blue)
      const team1Roster = [
        chars.find(c=>c.id==='circle_bot') || chars[0],
        chars.find(c=>c.id==='triangle_bot') || chars[1] || chars[0]
      ];
      this.team1 = new Team({
        id: 'team_1',
        name: 'Team Blue',
        color: 0x00aaff,
        roster: team1Roster,
        formation: 'line'
      });

      // Team 2 (Red)
      const team2Roster = [
        chars.find(c=>c.id==='square_bot') || chars[2] || chars[0],
        chars.find(c=>c.id==='circle_bot_2') || chars[3] || chars[0]
      ];
      this.team2 = new Team({
        id: 'team_2',
        name: 'Team Red',
        color: 0xff6b35,
        roster: team2Roster,
        formation: 'line'
      });

      const A = this.arena;

      // Create Team 1 Fighters
      const team1Positions = this.team1.getFormationPositions(team1Roster.length, A, 'left');
      for (let i=0; i<team1Roster.length; i++){
        const def = team1Roster[i];
        const pos = team1Positions[i];
        const f = new Fighter(this, Object.assign({
          id: `T1_F${i+1}`,
          teamId: 1,
          x: pos.x,
          y: pos.y,
          controllerProfile: this._uiOpts.p1 || 'aggressive'
        }, def));
        this.fighters.push(f);
        this._attachHpBar(f);
      }

      // Create Team 2 Fighters
      const team2Positions = this.team2.getFormationPositions(team2Roster.length, A, 'right');
      for (let i=0; i<team2Roster.length; i++){
        const def = team2Roster[i];
        const pos = team2Positions[i];
        const f = new Fighter(this, Object.assign({
          id: `T2_F${i+1}`,
          teamId: 2,
          x: pos.x,
          y: pos.y,
          controllerProfile: this._uiOpts.p2 || 'defensive'
        }, def));
        this.fighters.push(f);
        this._attachHpBar(f);
      }

      document.getElementById('p1-hp-fill')?.style.setProperty('width','100%');
      document.getElementById('p1-en-fill')?.style.setProperty('width','100%');
      document.getElementById('p2-hp-fill')?.style.setProperty('width','100%');
      document.getElementById('p2-en-fill')?.style.setProperty('width','100%');

      this.log(`Match gestartet: ${this.team1.name} vs ${this.team2.name} (2v2)`);
    },

    _attachHpBar: function(f){
      const w = 64, h = 6;
      f._hpBg   = this.add.rectangle(f.x, f.y - (f.radius+26), w, h, 0x2b2b36).setDepth(20);
      f._hpFill = this.add.rectangle(f.x - w/2 + 1, f.y - (f.radius+26), w-2, h-2, 0x35de85).setDepth(21).setOrigin(0,0.5);
    },

    update: function(time, delta){
      // Pause: keine Bewegungen/AI, HUD bleibt
      if (this._paused){
        this._renderHUD();
        return;
      }

      if (this.feel.preUpdate(delta)){ this._renderHUD(); return; }
      const dt = Math.min(delta, 50);
      const A = this.arena;

      // KI → Aktionen
      for (let i=0;i<this.fighters.length;i++){
        const f = this.fighters[i]; if (f.ko) continue;
        const enemies = this.fighters.filter(o=>o.teamId!==f.teamId && !o.ko);
        const allies  = this.fighters.filter(o=>o.teamId===f.teamId && o!==f && !o.ko);
        const snapshot = f.buildAISnapshot(enemies, allies, { arena:A });
        const action = window.GameBridge.getAIAction(f.controllerProfile, snapshot, this._uiOpts.useBrython);
        f.applyAIAction(action);
      }

      // Bewegung/States
      for (let i=0;i<this.fighters.length;i++){
        const f = this.fighters[i];
        f.update(dt, { arena:A });

        // HP-Balken updaten
        const w = 64;
        const hpRatio = Math.max(0, Math.min(1, f.hp / f.maxHp));
        const col = Phaser.Display.Color.Interpolate.RGBWithRGB(220,80,80, 53,222,133, 100*(hpRatio));
        const color = Phaser.Display.Color.GetColor(col.r|0, col.g|0, col.b|0);
        if (f._hpBg){ f._hpBg.setPosition(f.x, f.y-(f.radius+26)); }
        if (f._hpFill){
          f._hpFill.setPosition(f.x - w/2 + 1, f.y-(f.radius+26));
          f._hpFill.setSize((w-2)*hpRatio, 4);
          f._hpFill.setFillStyle(color);
        }
        const side = f.teamId===1?'p1':'p2';
        const hpEl = document.getElementById(`${side}-hp-fill`);
        if (hpEl) hpEl.style.width = (hpRatio*100)+'%';
        const enRatio = Math.max(0, Math.min(1, f.en / f.maxEn));
        const enEl = document.getElementById(`${side}-en-fill`);
        if (enEl) enEl.style.width = (enRatio*100)+'%';
      }

      // Treffer prüfen
      this.hitboxes.step(this.fighters, { showDebug:this._uiOpts.showHit });

      // Win-Condition prüfen
      this._checkWinCondition();

      this._renderHUD();
    },

    _checkWinCondition: function(){
      if (this._matchEnded) return;

      const team1Alive = this.fighters.filter(f=>f.teamId===1 && !f.ko).length;
      const team2Alive = this.fighters.filter(f=>f.teamId===2 && !f.ko).length;

      if (team1Alive === 0 && team2Alive > 0){
        this._matchEnded = true;
        this.log(`🏆 ${this.team2.name} gewinnt!`);
        this.team2.recordWin();
        this.team1.recordLoss();
        this._showMatchResult(this.team2, this.team1);
      } else if (team2Alive === 0 && team1Alive > 0){
        this._matchEnded = true;
        this.log(`🏆 ${this.team1.name} gewinnt!`);
        this.team1.recordWin();
        this.team2.recordLoss();
        this._showMatchResult(this.team1, this.team2);
      } else if (team1Alive === 0 && team2Alive === 0){
        this._matchEnded = true;
        this.log(`⚔️ Unentschieden! Beide Teams KO.`);
      }
    },

    _showMatchResult: function(winner, loser){
      // Award XP to all fighters
      const winnerFighters = this.fighters.filter(f=>f.teamId===winner.id.includes('1')?1:2);
      const loserFighters = this.fighters.filter(f=>f.teamId===loser.id.includes('1')?1:2);

      winnerFighters.forEach(f=>{
        const xpGain = 50; // Base XP for winning
        f.addXp(xpGain);
        f.trainingPoints += 50;
      });

      loserFighters.forEach(f=>{
        const xpGain = 20; // Consolation XP
        f.addXp(xpGain);
        f.trainingPoints += 20;
      });

      // TODO: Show result screen (Iteration 3)
      setTimeout(()=>{
        this._matchEnded = false;
      }, 3000);
    },

      _renderHUD: function(){
        if (!this._uiOpts.showDebug){
          if (this._hudWin) this._hudWin.style.display = 'none';
          if (this._hudEl) this._hudEl.textContent = '';
          return;
        }
        if (this._hudWin) this._hudWin.style.display = 'block';
        const fps = this.game.loop.actualFps|0;
        const a = this.fighters[0], b = this.fighters[1];
        const s1 = a? `${a.id} HP:${a.hp|0}/${a.maxHp} EN:${a.en|0}/${a.maxEn} ${a.state}${a.moveName?`(${a.moveName}:${a.moveFrame})`:''}` : '';
        const s2 = b? `${b.id} HP:${b.hp|0}/${b.maxHp} EN:${b.en|0}/${b.maxEn} ${b.state}${b.moveName?`(${b.moveName}:${b.moveFrame})`:''}` : '';
        if (this._hudEl) this._hudEl.textContent = `FPS:${fps}  Mode:${this._mode}  BrythonReady:${window.GameBridge.isBrythonReady()}  Hitstop:${this.feel.hitstopFrames}\n${s1}\n${s2}`;
      },

    _onSkillUsed: function({fighter, move}){
      const side = fighter.teamId===1?'P1':'P2';
      this.log(`${fighter.name} nutzt ${move}`);
      window.dispatchEvent(new CustomEvent('VC_PANEL_FLASH', { detail:{ side, skill:move }}));
    },
    _onHealUsed: function({fighter, amount}){
      const side = fighter.teamId===1?'P1':'P2';
      this.log(`${fighter.name} heilt ${amount}`);
      window.dispatchEvent(new CustomEvent('VC_PANEL_FLASH', { detail:{ side, skill:'heal' }}));
    },
    _onHit: function({attacker, defender, move, damage}){
      this.log(`${attacker.name} trifft ${defender.name} mit ${move} • DMG ${damage|0}`);
      if (defender.hp<=0){
        this.events.emit('ko', { winner: attacker, loser: defender });
      }
    },
    _onKO: function({winner, loser}){ this.log(`KO! ${winner.name} besiegt ${loser.name}`); }
  });

  window.Scenes.FightScene = FightScene;
})();
