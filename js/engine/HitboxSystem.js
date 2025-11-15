// FILE: js/engine/HitboxSystem.js
(function(){
  function HitboxSystem(scene){
    this.scene = scene;
    this.list = [];
    this.graphics = scene.add.graphics({}).setDepth(999);
    this._debug = false;
  }

  // hb: { shape:'circle', x,y,r, owner, damage, hitstun, hitstop, knock:{x,y}, kind }
  HitboxSystem.prototype.register = function(hb){
    if (!hb || hb.shape!=='circle') return;
    this.list.push(hb);
  };

  HitboxSystem.prototype.step = function(fighters, opts){
    this._debug = !!opts.showDebug;
    const g = this.graphics; g.clear();

    for (let i=0;i<this.list.length;i++){
      const hb = this.list[i], o = hb.owner;
      for (let j=0;j<fighters.length;j++){
        const f = fighters[j];
        if (f===o || f.teamId===o.teamId || f.ko) continue;
        // Skip if already hit by this skill activation
        if (o.hitThisSkill && o.hitThisSkill.has(f.id)) continue;
        if (circleOverlap(hb, f.hurt)){
          // Treffer!
          f.receiveHit(hb);
          // Mark as hit
          if (o.hitThisSkill) o.hitThisSkill.add(f.id);
          // Feedback
          this.scene.cameras.main.shake(60, 0.002);
          this.scene.feel.hitstop(hb.hitstop || 6);
          // Log-Event
          this.scene.events.emit('hit', { attacker:o, defender:f, move: hb.kind, damage: hb.damage });
        }
      }
      if (this._debug){ g.lineStyle(2, 0xffd36e, 1).strokeCircle(hb.x, hb.y, hb.r); }
    }

    // Hurt-Kreise debug
    if (this._debug){
      g.lineStyle(1, 0x7dc7ff, 0.8);
      for (let k=0;k<fighters.length;k++){
        const h = fighters[k].hurt; g.strokeCircle(h.x, h.y, h.r);
      }
    }

    this.list.length = 0;
  };

  function circleOverlap(a,b){
    const dx = a.x - b.x, dy = a.y - b.y;
    const rr = (a.r + b.r) * (a.r + b.r);
    return (dx*dx + dy*dy) <= rr;
  }

  window.Engine.HitboxSystem = HitboxSystem;
})();
