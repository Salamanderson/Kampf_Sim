// FILE: js/engine/Fighter.js
(function(){
  const TWO_PI = Math.PI * 2;

  const defaultMoves = {
    light: { name:'light', startup:6, active:3, recovery:8,  damage:7,  hitstun:10, hitstop:6,  range:40, radius:20 },
    heavy: { name:'heavy', startup:10,active:4, recovery:12, damage:12, hitstun:14, hitstop:8,  range:58, radius:24, lunge:80, cd:42 },
    spin:  { name:'spin',  startup:8, active:6,  recovery:10, damage:9,  hitstun:12, hitstop:8,  range:0,  radius:52, cd:90 },
    heal:  { name:'heal',  startup:10,active:0,  recovery:10, heal:18, cost:25,                   cd:120 }
  };

  const Fighter = function(scene, cfg){
    this.scene = scene;
    this.id = cfg.id || ('F'+Math.random().toString(36).slice(2,7));
    this.name = cfg.name || this.id;
    this.teamId = cfg.teamId || 1;
    this.controllerProfile = cfg.controllerProfile || 'aggressive';

    // Geometrie / Visual
    this.shape = cfg.shape || 'circle'; // circle | square | triangle
    this.color = (typeof cfg.color === 'number') ? cfg.color : 0x7fb2ff;
    this.radius = cfg.radius || 22;

    // Stats
    const base = {
      maxHp:100, maxEn:100,
      physicalAttack:1.0, energyAttack:1.0,
      attackSpeed:1.0, castSpeed:1.0, channelSpeed:1.0,
      physicalRange:1.0, energyRange:1.0,
      moveSpeed:240,
      physicalDefense:0, energyDefense:0,
      hpRegen:0, energyRegen:0,
      skillSlots:4,
      special:null,
      statusPower:0, statusDuration:1.0,
      statusResistance:0, statusDurationResistance:0,
      accel:1800, dashSpeed:560, friction:0.86
    };
    this.stats = Object.assign({}, base, cfg.stats||{});
    this.maxHp = this.stats.maxHp; this.hp = this.maxHp; this.maxEn = this.stats.maxEn; this.en = this.maxEn;

    // Loadout (welche Moves erlaubt)
    const loadout = cfg.loadout && Array.isArray(cfg.loadout) ? cfg.loadout.slice() : ['light','heavy','spin','heal'];
    this.moves = {};
    const slots = this.stats.skillSlots || loadout.length;
    loadout.slice(0, slots).forEach(k => { if (defaultMoves[k]) this.moves[k] = Object.assign({}, defaultMoves[k]); });

    // Physik
    this.x = cfg.x || 640; this.y = cfg.y || 360;
    this.vx = 0; this.vy = 0;
    this.facingAngle = 0; // rad

    // State
    this.state = 'idle'; // idle, move, dash, attack_*, hitstun, ko
    this.stateTimer = 0;
    this.moveName = null; this.moveFrame = 0;
    this.currentMove = null;
    this.cooldowns = { dash:0, spin:0, heal:0, heavy:0 };

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
    return {
      self: { id:this.id, teamId:this.teamId, x:this.x, y:this.y, vx:this.vx, vy:this.vy, hp:this.hp, maxHp:this.maxHp, en:this.en, state:this.state },
      closestEnemy: closest ? { id:closest.id, x:closest.x, y:closest.y, hp:closest.hp } : null,
      cooldowns: Object.assign({}, this.cooldowns),
      env: { arena: env.arena },
      frame: (this.scene.game.loop.frame|0)
    };
  };

  Fighter.prototype.applyAIAction = function(action){
    if (this.ko) return;
    switch(action){
      case 'move_towards': this._accelerateTo(1.0); this.state='move'; break;
      case 'move_away':    this._accelerateTo(-1.0); this.state='move'; break;
      case 'strafe_left':  this._strafe(+1); this.state='move'; break;
      case 'strafe_right': this._strafe(-1); this.state='move'; break;
      case 'dash': this.tryDash(); break;
      case 'attack_light': this.tryAttack('light'); break;
      case 'attack_heavy': this.tryAttack('heavy'); break;
      case 'spin': this.tryAttack('spin'); break;
      case 'heal': this.tryHeal(); break;
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
    const sp = Math.hypot(this.vx, this.vy);
    const maxSp = this.stats.moveSpeed;
    if (sp > maxSp){ const s = maxSp / sp; this.vx *= s; this.vy *= s; }
  };
  Fighter.prototype._strafe = function(side){
    const t = this._dirToClosest(); this.facingAngle = t.ang;
    const ang = t.ang + (side>0 ? +Math.PI/2 : -Math.PI/2);
    this.vx += Math.cos(ang) * this.stats.accel * (1/60);
    this.vy += Math.sin(ang) * this.stats.accel * (1/60);
    const sp = Math.hypot(this.vx, this.vy);
    const maxSp = this.stats.moveSpeed;
    if (sp > maxSp){ const s = maxSp / sp; this.vx *= s; this.vy *= s; }
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

  Fighter.prototype.tryHeal = function(){
    if (!this.moves.heal) return;
    if (this.cooldowns.heal>0 || this.state.startsWith('attack_')) return;
    if (this.en < (this.moves.heal.cost||0)) return;
    const m = this.moves.heal;
    const t = this._calcMoveTimings(m, 'heal');
    this.state = 'attack_heal'; this.moveName='heal'; this.moveFrame=0; this.currentMove={cfg:m,timing:t};
    this.stateTimer=t.startup+t.recovery;
    this.scene.events.emit('skill_used', { fighter:this, move:'heal' });
  };

  Fighter.prototype.tryAttack = function(kind){
    const m = this.moves[kind]; if (!m) return;
    if (this.state==='hitstun'||this.state==='dash'||this.state==='ko') return;
    if (this.state.startsWith('attack_')) return;
    if (m.cd && this.cooldowns[kind]>0) return;
    const t = this._calcMoveTimings(m, kind);
    this.state = 'attack_'+kind; this.moveName = kind; this.moveFrame=0;
    this.currentMove={cfg:m,timing:t};
    this.stateTimer = t.startup + t.active + t.recovery;
    this.scene.events.emit('skill_used', { fighter:this, move:kind });
  };

  Fighter.prototype._calcMoveTimings = function(m, kind){
    const sp = (kind==='heal') ? this.stats.castSpeed : this.stats.attackSpeed;
    const f = (v)=>Math.max(0, Math.round(v/Math.max(0.0001, sp)));
    return { startup:f(m.startup), active:f(m.active||0), recovery:f(m.recovery) };
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

    // Move-Logik
    if (this.state.startsWith('attack_')){
      this.moveFrame++; this.stateTimer--;
      const cm = this.currentMove || {cfg:this.moves[this.moveName], timing:{startup:0,active:0,recovery:0}};
      const m = cm.cfg, t = cm.timing;
      if (this.moveName==='heal'){
        if (this.moveFrame===t.startup){
          this.en -= (m.cost||0);
          const amount = (m.heal||0)*this.stats.energyAttack;
          this.hp = Math.min(this.maxHp, this.hp + amount);
          this.cooldowns.heal = (m.cd||120)/60;
          this.scene.events.emit('heal_used', { fighter:this, amount });
          this._vfxRing(this.radius+10, 0x7ad7ff);
        }
      } else {
        const actStart = t.startup + 1, actEnd = t.startup + t.active;
        if (this.moveFrame===t.startup){
          // VFX zu Begin
          if (this.moveName==='light') this._vfxSwipe(30, 2, 0xffffff);
          if (this.moveName==='heavy') this._vfxSwipe(46, 3, 0xffe08a);
          if (this.moveName==='spin') this._vfxRing(this.radius+12, 0xffd36e);
        }
        if (this.moveFrame>=actStart && this.moveFrame<=actEnd){
          // Kreis-Hitbox
          const ang = this.facingAngle;
          const rng = (m.range||0) * this.stats.physicalRange;
          const cx = this.x + (rng? Math.cos(ang)*(this.radius + rng*0.6) : 0);
          const cy = this.y + (rng? Math.sin(ang)*(this.radius + rng*0.6) : 0);
          const pos = (this.moveName==='spin') ? {x:this.x, y:this.y} : {x:cx, y:cy};
          const hb = {
            shape:'circle', owner:this, kind:this.moveName, type:'physical',
            x: pos.x, y: pos.y, r: m.radius || 20,
            damage:(m.damage||0)*this.stats.physicalAttack,
            hitstun:m.hitstun||10, hitstop:m.hitstop||6,
            knock:{ x: Math.cos(ang)*140, y: Math.sin(ang)*140 }
          };
          this.scene.hitboxes.register(hb);
        }
        if (this.moveName==='heavy' && this.moveFrame===t.startup){
          const d = this._dirToClosest(); this.facingAngle = d.ang;
          this.vx += Math.cos(d.ang)*(m.lunge||0); this.vy += Math.sin(d.ang)*(m.lunge||0);
          this.cooldowns.heavy = (m.cd||42)/60;
        }
        if (this.moveName==='spin' && this.moveFrame===1){
          this.cooldowns.spin = (m.cd||90)/60;
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

    // Regeneration
    if (this.stats.hpRegen>0){
      this.hp = Math.min(this.maxHp, this.hp + this.stats.hpRegen * (dt/1000));
    }
    if (this.stats.energyRegen>0){
      this.en = Math.min(this.maxEn, this.en + this.stats.energyRegen * (dt/1000));
    }

    // KO
    if (this.hp<=0 && !this.ko){ this.ko=true; this.state='ko'; if (this.node.setFillStyle) this.node.setFillStyle(0x333346); }
  };

  Fighter.prototype.receiveHit = function(h){
    if (this.ko) return;
    const isEnergy = h.type==='energy';
    const def = isEnergy ? this.stats.energyDefense : this.stats.physicalDefense;
    const dmg = Math.max(0, (h.damage||0) * (1 - def));
    this.hp -= dmg;
    this.scene.feel.onHit(h);
    this.vx += h.knock.x*0.02; this.vy += h.knock.y*0.02;
    this.state = 'hitstun'; this.stateTimer = h.hitstun;
    if (this.node.setAlpha) { this.node.setAlpha(0.9); setTimeout(()=>this.node&&this.node.setAlpha(1), 60); }
  };

  window.Engine.Fighter = Fighter;
})();
