// FILE: js/engine/Fighter.js
(function(){
  const TWO_PI = Math.PI * 2;

  const defaultMoves = {
    // AGGRESSIVE SKILLS (Close-range fighters) - OBB Hitboxes
    slash: { name:'slash', type:'physical', startup:5, active:3, recovery:7,  damage:8,  hitstun:10, hitstop:5,  range:45, radius:22, shape:'rect', width:80, height:50, color:0xffaa55 },
    power_strike: { name:'power_strike', type:'physical', startup:12,active:4, recovery:14, damage:18, hitstun:18, hitstop:10, range:60, radius:28, shape:'rect', width:100, height:60, lunge:90, cd:50, color:0xff5555 },
    whirlwind: { name:'whirlwind', type:'physical', startup:8, active:8,  recovery:12, damage:6,  hitstun:8, hitstop:6,  range:0,  radius:65, cd:80, color:0xffd700, hits:3 },
    dash_strike: { name:'dash_strike', type:'physical', startup:10,active:4, recovery:12, damage:13, hitstun:15, hitstop:8, range:80, radius:24, lunge:140, cd:60, color:0xff8844 },

    // RANGED/POKE SKILLS (Mid-to-long range) - OBB Hitboxes
    poke: { name:'poke', type:'physical', startup:6, active:2, recovery:6,  damage:6,  hitstun:8, hitstop:4,  range:70, radius:18, shape:'rect', width:120, height:30, color:0x88ccff },
    snipe: { name:'snipe', type:'physical', startup:8, active:2, recovery:10, damage:10, hitstun:12, hitstop:6, range:140, radius:16, cd:50, color:0x77ddff },

    // MOBILITY/POSITIONING SKILLS
    shield_bash: { name:'shield_bash', type:'physical', startup:10,active:3, recovery:10, damage:10, hitstun:16, hitstop:8, range:50, radius:26, lunge:40, cd:60, knockback:2.5, color:0x5599ff },
    retreat: { name:'retreat', type:'physical', startup:6, active:2, recovery:8, damage:4, hitstun:6, hitstop:3, range:50, radius:20, lunge:-80, cd:70, color:0xaaaaff },

    // ZONE CONTROL
    ground_slam: { name:'ground_slam', type:'physical', startup:14,active:5, recovery:14, damage:14, hitstun:14, hitstop:9, range:0, radius:70, cd:70, color:0xff9944 },

    // SUPPORT/UTILITY
    guard: { name:'guard', type:'energy', startup:6,active:0,  recovery:6, buff:'defense', buffAmount:15, duration:180, cost:30, cd:150, color:0x9999ff },
    area_heal: { name:'area_heal', type:'energy', startup:12,active:0,  recovery:10, heal:12, cost:35, cd:140, radius:120, isAoE:true, color:0x66ffaa },
    quick_heal: { name:'quick_heal', type:'energy', startup:8,active:0,  recovery:8, heal:15, cost:20, cd:100, color:0x7ad7ff },
    self_heal: { name:'self_heal', type:'energy', startup:10,active:0,  recovery:10, heal:20, cost:25, cd:120, color:0x88ff88 },
    fortify: { name:'fortify', type:'energy', startup:8,active:0,  recovery:8, buff:'fortify', buffAmount:20, duration:240, cost:25, cd:160, color:0xccaa77 },

    // BASIC ATTACKS
    punch: { name:'punch', type:'physical', startup:6, active:3, recovery:8,  damage:9,  hitstun:10, hitstop:6,  range:40, radius:20, color:0xffcc66 }
  };

  const Fighter = function(scene, cfg){
    this.scene = scene;
    this.id = cfg.id || ('F'+Math.random().toString(36).slice(2,7));
    this.name = cfg.name || this.id;
    this.teamId = cfg.teamId || 1;
    this.controllerProfile = cfg.controllerProfile || 'aggressive';

    // Progression System
    this.level = cfg.level || 1;
    this.xp = cfg.xp || 0;
    this.xpToNext = this._calculateXpToNext(this.level);

    // Personality (for AI behavior)
    const defaultPersonality = { aggression:5, teamplay:5, riskTaking:5, positioning:5, energyManagement:5 };
    this.personality = Object.assign({}, defaultPersonality, cfg.personality||{});

    // Items (3 slots)
    this.items = cfg.items && Array.isArray(cfg.items) ? cfg.items.slice(0, 3) : [];

    // Training Points
    this.trainingPoints = cfg.trainingPoints || 0;

    // Geometrie / Visual
    this.shape = cfg.shape || 'circle'; // circle | square | triangle
    this.color = (typeof cfg.color === 'number') ? cfg.color : 0x7fb2ff;
    this.radius = cfg.radius || 22;

    // Stats - Save base stats before applying items
    const base = {
      maxHp:100, maxEn:100,
      physAtk:1, energyAtk:1,
      attackSpeed:1, castSpeed:1, channelSpeed:1,
      physRange:1, energyRange:1,
      accel:1800, moveSpeed:240, dashSpeed:560, friction:0.86,
      physDef:0, energyDef:0,
      hpRegen:0, enRegen:0,
      skillSlots:4, special:null,
      statusPower:0, statusDuration:1, statusResist:0, statusDurationResist:1,
      damageScale:1.0
    };
    this.baseStats = Object.assign({}, base, cfg.stats||{});
    this.stats = Object.assign({}, this.baseStats);

    // Apply item bonuses after stats are set
    this.applyItemBonuses();

    this.maxHp = this.stats.maxHp; this.maxEn = this.stats.maxEn;
    this.hp = this.maxHp; this.en = this.maxEn;

    // Loadout (welche Moves erlaubt)
    const loadout = cfg.loadout && Array.isArray(cfg.loadout) ? cfg.loadout.slice() : ['slash','power_strike','whirlwind','quick_heal'];
    console.log('[Fighter] Constructor: id=', this.id, 'loadout=', loadout, 'cfg.loadout=', cfg.loadout);
    this.moves = {};
    loadout.forEach(k => {
      if (defaultMoves[k]) {
        this.moves[k] = Object.assign({}, defaultMoves[k]);
      } else {
        console.warn('[Fighter] Skill not found in defaultMoves:', k);
      }
    });
    console.log('[Fighter] Final moves:', Object.keys(this.moves));

    // Physik
    this.x = cfg.x || 640; this.y = cfg.y || 360;
    this.vx = 0; this.vy = 0;
    this.facingAngle = 0; // rad

    // State
    this.state = 'idle'; // idle, move, dash, attack_*, hitstun, ko
    this.stateTimer = 0;
    this.moveName = null; this.moveFrame = 0;

    // Initialize cooldowns for all moves dynamically
    this.cooldowns = { dash:0 };
    Object.keys(this.moves).forEach(k => { this.cooldowns[k] = 0; });

    // Visual Node
    this.node = this._createNode();

    // Hurt-Kreis
    this.hurt = { x:this.x, y:this.y, r:this.radius };

    this.ko = false;
  };

  Fighter.prototype._createNode = function(){
    const s = this.scene;
    if (this.shape === 'circle'){
      return s.add.circle(this.x, this.y, this.radius, this.color).setDepth(5);
    } else if (this.shape === 'square'){
      const side = this.radius*2;
      const r = s.add.rectangle(this.x, this.y, side, side, this.color).setDepth(5);
      r.setAngle(45);
      return r;
    } else {
      const r = this.radius;
      const poly = new Phaser.Geom.Polygon([ 0,-r*1.2,  r*0.9,r*1.0,  -r*0.9,r*1.0 ]);
      const g = s.add.graphics().setDepth(5);
      g.fillStyle(this.color, 1); g.fillPoints(poly.points, true);
      g.setPosition(this.x, this.y);
      g._isTriangle = true;
      return g;
    }
  };

  function rotate(px,py,ang){ return { x: px*Math.cos(ang)-py*Math.sin(ang), y: px*Math.sin(ang)+py*Math.cos(ang) }; }

  Fighter.prototype._updateNode = function(){
    if (!this.node) return;
    if (this.node._isTriangle){
      const g = this.node; g.clear(); g.fillStyle(this.color,1);
      const r = this.radius; const a = this.facingAngle;
      const p1 = rotate( 0,-r*1.2, a), p2 = rotate( r*0.9, r*1.0, a), p3 = rotate(-r*0.9, r*1.0, a);
      g.fillPoints([new Phaser.Geom.Point(p1.x,p1.y), new Phaser.Geom.Point(p2.x,p2.y), new Phaser.Geom.Point(p3.x,p3.y)], true);
      g.setPosition(this.x, this.y);
    } else {
      this.node.setPosition(this.x, this.y);
      if (this.node.type === 'Rectangle') this.node.setRotation(this.facingAngle + Math.PI/4);
    }
  };

  Fighter.prototype.destroy = function(){ this.node?.destroy(); this.node = null; };

  Fighter.prototype.buildAISnapshot = function(enemies, allies, env){
    let closest=null, dmin=1e9;
    for (let i=0;i<enemies.length;i++){
      const e = enemies[i]; const d = Math.hypot(e.x-this.x, e.y-this.y);
      if (d<dmin){ dmin=d; closest=e; }
    }

    // Find closest ally
    let closestAlly=null, aminDist=1e9;
    for (let i=0;i<allies.length;i++){
      const a = allies[i]; const d = Math.hypot(a.x-this.x, a.y-this.y);
      if (d<aminDist){ aminDist=d; closestAlly=a; }
    }

    return {
      self: { id:this.id, teamId:this.teamId, x:this.x, y:this.y, vx:this.vx, vy:this.vy, hp:this.hp, maxHp:this.maxHp, en:this.en, maxEn:this.maxEn, state:this.state },
      closestEnemy: closest ? { id:closest.id, x:closest.x, y:closest.y, hp:closest.hp } : null,
      closestAlly: closestAlly ? { id:closestAlly.id, x:closestAlly.x, y:closestAlly.y, hp:closestAlly.hp, dist:aminDist } : null,
      personality: this.personality,
      cooldowns: Object.assign({}, this.cooldowns),
      env: { arena: env.arena },
      frame: (this.scene.game.loop.frame|0)
    };
  };

  Fighter.prototype.applyAIAction = function(action){
    if (this.ko) return;
    // Map generic actions to character-specific skills
    switch(action){
      case 'move_towards': this._accelerateTo(1.0); this.state='move'; break;
      case 'move_away':    this._accelerateTo(-1.0); this.state='move'; break;
      case 'strafe_left':  this._strafe(+1); this.state='move'; break;
      case 'strafe_right': this._strafe(-1); this.state='move'; break;
      case 'dash': this.tryDash(); break;

      // Generic attack actions map to character-specific skills
      case 'attack_light':
        // Try first skill in loadout (usually light attack)
        const lightSkill = Object.keys(this.moves)[0];
        if (lightSkill) this.tryAttack(lightSkill);
        break;
      case 'attack_heavy':
        // Try second skill in loadout (usually heavy attack)
        const heavySkill = Object.keys(this.moves)[1];
        if (heavySkill) this.tryAttack(heavySkill);
        break;
      case 'spin':
        // Try third skill in loadout (usually AoE/special)
        const spinSkill = Object.keys(this.moves)[2];
        if (spinSkill) this.tryAttack(spinSkill);
        break;
      case 'heal':
        // Try fourth skill in loadout (usually heal/buff)
        const healSkill = Object.keys(this.moves)[3];
        if (healSkill) {
          const move = this.moves[healSkill];
          if (move.type === 'energy' && !move.damage) {
            this.tryHeal(healSkill);
          } else {
            this.tryAttack(healSkill);
          }
        }
        break;
      default: /* idle */ break;
    }
  };

  Fighter.prototype._dirToClosest = function(){
    const foes = this.scene.fighters?.filter(o=>o.teamId!==this.teamId && !o.ko) || [];
    if (!foes.length) return {dx:0,dy:0,dist:1e9,ang:this.facingAngle};
    const e = foes[0];
    const dx = e.x - this.x, dy = e.y - this.y;
    const ang = Math.atan2(dy, dx);
    return { dx, dy, dist: Math.hypot(dx,dy), ang };
  };

  Fighter.prototype._accelerateTo = function(sign){
    const t = this._dirToClosest(); this.facingAngle = t.ang;
    const ax = Math.cos(t.ang) * this.stats.accel * sign;
    const ay = Math.sin(t.ang) * this.stats.accel * sign;
    this.vx += ax * (1/60); this.vy += ay * (1/60);
  };
  Fighter.prototype._strafe = function(side){
    const t = this._dirToClosest(); this.facingAngle = t.ang;
    const ang = t.ang + (side>0 ? +Math.PI/2 : -Math.PI/2);
    this.vx += Math.cos(ang) * this.stats.accel * (1/60);
    this.vy += Math.sin(ang) * this.stats.accel * (1/60);
  };

  Fighter.prototype.tryDash = function(){
    if (this.cooldowns.dash > 0 || this.state==='dash') return;
    const t = this._dirToClosest(); this.facingAngle = t.ang;
    const sp = this.stats.dashSpeed;
    this.vx = Math.cos(t.ang)*sp; this.vy = Math.sin(t.ang)*sp;
    this.state = 'dash'; this.stateTimer = 12;
    this.cooldowns.dash = 60/60; // 1s
    this._vfxTrail();
  };

  Fighter.prototype.tryHeal = function(skillName){
    // Generalisiert für alle Heal-Skills (quick_heal, self_heal, area_heal, etc.)
    if (!skillName) skillName = 'heal'; // Fallback
    const base = this.moves[skillName];
    if (!base) return;
    if (this.cooldowns[skillName]>0 || this.state.startsWith('attack_')) return;
    if (this.en < (base.cost||0)) return;

    const speed = this.stats.castSpeed;
    const m = Object.assign({}, base, {
      startup: Math.max(1, Math.round(base.startup / speed)),
      recovery: Math.max(1, Math.round(base.recovery / speed)),
      heal: (base.heal||0) * this.stats.energyAtk
    });
    this.currentMove = m;
    this.state = 'attack_'+skillName;
    this.moveName=skillName;
    this.moveFrame=0;
    this.stateTimer=m.startup + m.recovery;
    this.scene.events.emit('skill_used', { fighter:this, move:skillName });
  };

  Fighter.prototype.tryAttack = function(kind){
    const base = this.moves[kind]; if (!base) return;
    if (this.state==='hitstun'||this.state==='dash'||this.state==='ko') return;
    if (this.state.startsWith('attack_')) return;
    if (base.cd && this.cooldowns[kind]>0) return;
    const speed = base.type==='energy'?this.stats.castSpeed:this.stats.attackSpeed;
    const m = Object.assign({}, base, {
      startup: Math.max(1, Math.round(base.startup / speed)),
      active:  Math.max(0, Math.round((base.active||0) / speed)),
      recovery:Math.max(1, Math.round(base.recovery / speed)),
      damage:(base.damage||0) * (base.type==='energy'?this.stats.energyAtk:this.stats.physAtk),
      range: (base.range||0) * (base.type==='energy'?this.stats.energyRange:this.stats.physRange)
    });
    this.currentMove = m;
    this.state = 'attack_'+kind; this.moveName = kind; this.moveFrame=0; this.stateTimer = m.startup + (m.active||0) + m.recovery;
    this.scene.events.emit('skill_used', { fighter:this, move:kind });
  };

  Fighter.prototype._applyFriction = function(){
    this.vx *= this.stats.friction; this.vy *= this.stats.friction;
    if (Math.abs(this.vx)<0.05) this.vx=0; if (Math.abs(this.vy)<0.05) this.vy=0;
  };

  // Einfache VFX
  Fighter.prototype._vfxSwipe = function(len, thick, color){
    const ang = this.facingAngle;
    const x1 = this.x + Math.cos(ang)*(this.radius+6);
    const y1 = this.y + Math.sin(ang)*(this.radius+6);
    const x2 = x1 + Math.cos(ang)*len;
    const y2 = y1 + Math.sin(ang)*len;
    const g = this.scene.add.graphics().setDepth(50);
    g.lineStyle(thick, color, 1).lineBetween(x1,y1,x2,y2);
    this.scene.tweens.add({ targets:g, alpha:0, duration:120, onComplete:()=>g.destroy() });
  };
  Fighter.prototype._vfxRing = function(r, color){
    const g = this.scene.add.graphics().setDepth(49);
    g.lineStyle(2, color, 1).strokeCircle(this.x, this.y, r);
    this.scene.tweens.add({ targets:g, alpha:0, duration:180, onComplete:()=>g.destroy() });
  };
  Fighter.prototype._vfxTrail = function(){
    const g = this.scene.add.graphics().setDepth(48);
    g.fillStyle(0xffffff, .08).fillCircle(this.x, this.y, this.radius*1.2);
    this.scene.tweens.add({ targets:g, alpha:0, duration:160, onComplete:()=>g.destroy() });
  };

  Fighter.prototype.update = function(dt, world){
    if (this.ko) return;

    // Cooldowns
    for (const k of Object.keys(this.cooldowns)){
      if (this.cooldowns[k]>0) this.cooldowns[k] -= dt/1000; // Sekunden
    }

    // Regeneration
    if (this.stats.hpRegen>0){
      this.hp = Math.min(this.maxHp, this.hp + this.stats.hpRegen * dt/1000);
    }
    if (this.stats.enRegen>0){
      this.en = Math.min(this.maxEn, this.en + this.stats.enRegen * dt/1000);
    }

    // Move-Logik
    if (this.state.startsWith('attack_')){
      this.moveFrame++; this.stateTimer--;
      const m = this.currentMove || this.moves[this.moveName];

      // Heal/Buff Skills
      if (m.type==='energy' && !m.damage){
        if (this.moveFrame===m.startup){
          this.en -= (m.cost||0);

          // Heal-Skills
          if (m.heal){
            const amount = (m.heal||0);
            if (m.isAoE){
              // AoE Heal (area_heal)
              this.hp = Math.min(this.maxHp, this.hp + amount);
              const allies = this.scene.fighters?.filter(f=>f.teamId===this.teamId && f!==this && !f.ko) || [];
              for (const ally of allies){
                const dist = Math.hypot(ally.x-this.x, ally.y-this.y);
                if (dist <= (m.radius||120)){
                  ally.hp = Math.min(ally.maxHp, ally.hp + amount);
                }
              }
              this._vfxRing(m.radius||120, m.color||0x66ffaa);
            } else {
              // Self Heal
              this.hp = Math.min(this.maxHp, this.hp + amount);
              this._vfxRing(this.radius+10, m.color||0x7ad7ff);
            }
            this.scene.events.emit('heal_used', { fighter:this, amount });
          }

          // Buff-Skills (guard, fortify)
          if (m.buff){
            // TODO: Implement buffs properly in future iteration
            this._vfxRing(this.radius+15, m.color||0x9999ff);
          }

          this.cooldowns[this.moveName] = (m.cd||120)/60;
        }
      } else {
        // Attack Skills
        const actStart = m.startup + 1, actEnd = m.startup + m.active;
        if (this.moveFrame===m.startup){
          // VFX mit skill-spezifischen Farben
          const color = m.color || 0xffffff;
          if (m.range > 0){
            // Swipe/Slash für ranged attacks
            const len = m.range * 0.7;
            const thick = m.radius ? Math.max(2, m.radius/10) : 2;
            this._vfxSwipe(len, thick, color);
          } else {
            // Ring für AoE attacks
            this._vfxRing((m.radius||40)+8, color);
          }
        }
        // Lunge (for power attacks)
        if (m.lunge && this.moveFrame===m.startup){
          const t = this._dirToClosest(); this.facingAngle = t.ang;
          this.vx += Math.cos(t.ang)*m.lunge;
          this.vy += Math.sin(t.ang)*m.lunge;
        }

        // Hitbox Registration
        if (this.moveFrame>=actStart && this.moveFrame<=actEnd){
          const ang = this.facingAngle;
          // Offset berechnen (wie weit vor dem Spieler)
          const rangeOffset = m.range ? (this.radius + m.range*0.5) : 0;
          const cx = this.x + Math.cos(ang) * rangeOffset;
          const cy = this.y + Math.sin(ang) * rangeOffset;

          const pos = (m.range===0) ? {x:this.x, y:this.y} : {x:cx, y:cy};

          const knockMultiplier = m.knockback || 1.0;

          // Prüfen ob Rechteck oder Kreis (Fallback)
          const isRect = (m.shape === 'rect');

          const hb = {
            owner: this,
            kind: this.moveName,
            type: m.type||'physical',

            // Positionsdaten
            x: pos.x,
            y: pos.y,
            angle: ang, // WICHTIG: Die Rotation des Spielers übergeben

            // Formdaten
            shape: isRect ? 'rect' : 'circle',
            w: m.width || 40,
            h: m.height || 40,
            r: m.radius || 20, // Fallback Radius

            // Combat Stats
            damage: (m.damage||0) * this.stats.damageScale,
            hitstun: m.hitstun||10,
            hitstop: m.hitstop||6,
            knock: { x: Math.cos(ang)*140*knockMultiplier, y: Math.sin(ang)*140*knockMultiplier }
          };
          this.scene.hitboxes.register(hb);

          // Multi-hit skills (whirlwind)
          if (m.hits && this.moveFrame === actStart){
            this._multiHitCounter = m.hits - 1; // Already registering one hit above
          }
        }

        // Set cooldown
        if (this.moveFrame===1 && m.cd){
          this.cooldowns[this.moveName] = m.cd/60;
        }
      }
      if (this.stateTimer<=0){ this.state='idle'; this.moveName=null; this.moveFrame=0; this.currentMove=null; }
    }

    if (this.state==='dash'){
      this.stateTimer--;
      if (this.stateTimer<=0) this.state='idle';
    }

    // Physik
    this._applyFriction();
    const maxSp = this.stats.moveSpeed;
    const sp = Math.hypot(this.vx, this.vy);
    if (sp>maxSp){ const s=maxSp/sp; this.vx*=s; this.vy*=s; }
    this.x += this.vx * (dt/1000);
    this.y += this.vy * (dt/1000);

    // Facing
    const t = this._dirToClosest(); this.facingAngle = t.ang;

    // Arena-Bounds
    const A = world.arena; const pad = this.radius+2;
    const minX=A.x-A.w/2+pad, maxX=A.x+A.w/2-pad, minY=A.y-A.h/2+pad, maxY=A.y+A.h/2-pad;
    this.x = Phaser.Math.Clamp(this.x, minX, maxX);
    this.y = Phaser.Math.Clamp(this.y, minY, maxY);

    // Visual
    this._updateNode();
    this.hurt.x=this.x; this.hurt.y=this.y;

    // KO
    if (this.hp<=0 && !this.ko){ this.ko=true; this.state='ko'; if (this.node.setFillStyle) this.node.setFillStyle(0x333346); }
  };

  Fighter.prototype.receiveHit = function(h){
    if (this.ko) return;
    let dmg = h.damage;
    if (h.type==='energy'){
      dmg *= 100/(100+this.stats.energyDef);
    } else {
      dmg *= 100/(100+this.stats.physDef);
    }
    this.hp -= dmg;
    this.scene.feel.onHit(h);
    this.vx += h.knock.x*0.02; this.vy += h.knock.y*0.02;
    this.state = 'hitstun'; this.stateTimer = h.hitstun;
    if (this.node.setAlpha) { this.node.setAlpha(0.9); setTimeout(()=>this.node&&this.node.setAlpha(1), 60); }
  };

  // Progression Helpers
  Fighter.prototype._calculateXpToNext = function(level){
    return Math.floor(100 + (level * 50)); // 100, 150, 200, 250...
  };

  Fighter.prototype.addXp = function(amount){
    this.xp += amount;
    while (this.xp >= this.xpToNext){
      this.xp -= this.xpToNext;
      this.levelUp();
    }
  };

  Fighter.prototype.levelUp = function(){
    this.level++;
    this.xpToNext = this._calculateXpToNext(this.level);
    // Stat gains per level
    this.stats.maxHp += 5;
    this.stats.maxEn += 3;
    this.stats.physAtk += 0.05;
    this.stats.energyAtk += 0.05;
    this.stats.moveSpeed += 2;
    this.maxHp = this.stats.maxHp;
    this.maxEn = this.stats.maxEn;
    // Don't heal on level up - keep current HP/EN so end-of-match bars stay accurate
  };

  // Item System Helpers
  Fighter.prototype.applyItemBonuses = function(){
    // Start with base stats
    const base = {
      maxHp:100, maxEn:100,
      physAtk:1, energyAtk:1,
      attackSpeed:1, castSpeed:1, channelSpeed:1,
      physRange:1, energyRange:1,
      accel:1800, moveSpeed:240, dashSpeed:560, friction:0.86,
      physDef:0, energyDef:0,
      hpRegen:0, enRegen:0,
      skillSlots:4, special:null,
      statusPower:0, statusDuration:1, statusResist:0, statusDurationResist:1,
      damageScale:1.0
    };

    // Merge character's base stats
    this.stats = Object.assign({}, base, this.baseStats||{});

    // Apply item bonuses
    if (!window.GameData?.items) return;

    let appliedItems = 0;
    for (let i=0; i<this.items.length; i++){
      const itemId = this.items[i];
      if (!itemId) continue;

      const itemDef = window.GameData.items.find(it => it.id === itemId);
      if (!itemDef || !itemDef.stats) continue;

      console.log(`[Fighter] ${this.name} applying item:`, itemDef.name, itemDef.stats);
      appliedItems++;

      for (const key of Object.keys(itemDef.stats)){
        const bonus = itemDef.stats[key];
        const oldValue = this.stats[key];

        // Multiplicative bonuses (decimal values like 0.2 = +20%)
        if (typeof bonus === 'number' && bonus > -1 && bonus < 5 &&
            ['physAtk','energyAtk','attackSpeed','castSpeed','channelSpeed',
             'physRange','energyRange','moveSpeed','dashSpeed'].includes(key)){
          this.stats[key] = (this.stats[key] || 0) * (1 + bonus);
        } else {
          // Additive bonuses (flat values like +30 HP)
          this.stats[key] = (this.stats[key] || 0) + bonus;
        }

        if (oldValue !== this.stats[key]){
          console.log(`[Fighter] ${this.name} ${key}: ${oldValue} -> ${this.stats[key]}`);
        }
      }
    }

    if (appliedItems > 0){
      console.log(`[Fighter] ${this.name} final stats after ${appliedItems} items:`, {
        maxHp: this.stats.maxHp,
        physAtk: this.stats.physAtk.toFixed(2),
        energyAtk: this.stats.energyAtk.toFixed(2),
        moveSpeed: this.stats.moveSpeed.toFixed(1)
      });
    }

    // Update maxHp/maxEn references
    this.maxHp = this.stats.maxHp;
    this.maxEn = this.stats.maxEn;
  };

  Fighter.prototype.equipItem = function(itemId, slot){
    if (slot < 0 || slot > 2) return;
    this.items[slot] = itemId;
    this.applyItemBonuses();
  };

  Fighter.prototype.unequipItem = function(slot){
    if (slot < 0 || slot > 2) return;
    this.items[slot] = null;
    this.applyItemBonuses();
  };

  window.Engine.Fighter = Fighter;
})();
