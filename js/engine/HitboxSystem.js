// FILE: js/engine/HitboxSystem.js
// Erweitert mit OBB (Oriented Bounding Box) Unterstützung für rechteckige Hitboxes
(function(){
  function HitboxSystem(scene){
    this.scene = scene;
    this.list = [];
    this.graphics = scene.add.graphics({}).setDepth(999);
    this._debug = false;
  }

  // hb: { shape:'circle'|'rect', x, y, r (für circle), w, h, angle (für rect), owner, damage, hitstun, hitstop, knock:{x,y}, kind }
  HitboxSystem.prototype.register = function(hb){
    if (!hb) return;
    // Akzeptiere sowohl 'circle' als auch 'rect'
    if (hb.shape !== 'circle' && hb.shape !== 'rect') {
      hb.shape = 'circle'; // Fallback
    }
    this.list.push(hb);
  };

  HitboxSystem.prototype.step = function(fighters, opts){
    this._debug = !!opts.showDebug;
    const g = this.graphics; g.clear();

    for (let i = 0; i < this.list.length; i++){
      const hb = this.list[i], o = hb.owner;

      for (let j = 0; j < fighters.length; j++){
        const f = fighters[j];
        if (f === o || f.teamId === o.teamId || f.ko) continue;

        // Kollisionsprüfung basierend auf Hitbox-Form
        let hit = false;
        if (hb.shape === 'rect') {
          hit = testRectCircle(hb, f.hurt);
        } else {
          hit = circleOverlap(hb, f.hurt);
        }

        if (hit){
          // Treffer!
          f.receiveHit(hb);
          // Feedback
          this.scene.cameras.main.shake(60, 0.002);
          this.scene.feel.hitstop(hb.hitstop || 6);
          // Log-Event
          this.scene.events.emit('hit', { attacker: o, defender: f, move: hb.kind, damage: hb.damage });
        }
      }

      // Debug-Zeichnung
      if (this._debug){
        if (hb.shape === 'rect') {
          drawRotatedRect(g, hb.x, hb.y, hb.w, hb.h, hb.angle, 0xffd36e);
        } else {
          g.lineStyle(2, 0xffd36e, 1).strokeCircle(hb.x, hb.y, hb.r);
        }
      }
    }

    // Hurt-Kreise debug
    if (this._debug){
      g.lineStyle(1, 0x7dc7ff, 0.8);
      for (let k = 0; k < fighters.length; k++){
        const h = fighters[k].hurt;
        g.strokeCircle(h.x, h.y, h.r);
      }
    }

    this.list.length = 0;
  };

  // ============================================
  // KOLLISIONS-FUNKTIONEN
  // ============================================

  // Kreis vs Kreis
  function circleOverlap(a, b){
    const dx = a.x - b.x, dy = a.y - b.y;
    const rr = (a.r + b.r) * (a.r + b.r);
    return (dx * dx + dy * dy) <= rr;
  }

  // OBB (Rotiertes Rechteck) vs Kreis
  // rect: { x, y, w, h, angle }
  // circle: { x, y, r }
  function testRectCircle(rect, circle){
    // Schritt 1: Transformiere den Kreismittelpunkt in das lokale Koordinatensystem des Rechtecks
    const cos = Math.cos(-rect.angle);
    const sin = Math.sin(-rect.angle);

    // Vektor vom Rechteck-Zentrum zum Kreis-Zentrum
    const dx = circle.x - rect.x;
    const dy = circle.y - rect.y;

    // Rotiere den Vektor in das lokale Koordinatensystem
    const localX = dx * cos - dy * sin;
    const localY = dx * sin + dy * cos;

    // Schritt 2: Finde den nächsten Punkt auf dem Rechteck (im lokalen Raum)
    const halfW = rect.w / 2;
    const halfH = rect.h / 2;

    const closestX = Math.max(-halfW, Math.min(halfW, localX));
    const closestY = Math.max(-halfH, Math.min(halfH, localY));

    // Schritt 3: Berechne die Distanz vom nächsten Punkt zum Kreismittelpunkt
    const distX = localX - closestX;
    const distY = localY - closestY;
    const distSquared = distX * distX + distY * distY;

    // Treffer wenn Distanz <= Kreisradius
    return distSquared <= (circle.r * circle.r);
  }

  // ============================================
  // DEBUG-ZEICHNUNG
  // ============================================

  // Zeichnet ein rotiertes Rechteck
  function drawRotatedRect(graphics, cx, cy, w, h, angle, color){
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const halfW = w / 2;
    const halfH = h / 2;

    // 4 Ecken im lokalen Raum
    const corners = [
      { x: -halfW, y: -halfH },  // oben-links
      { x:  halfW, y: -halfH },  // oben-rechts
      { x:  halfW, y:  halfH },  // unten-rechts
      { x: -halfW, y:  halfH }   // unten-links
    ];

    // Transformiere Ecken in Weltkoordinaten
    const worldCorners = corners.map(c => ({
      x: cx + c.x * cos - c.y * sin,
      y: cy + c.x * sin + c.y * cos
    }));

    // Zeichne das Rechteck
    graphics.lineStyle(2, color, 1);
    graphics.beginPath();
    graphics.moveTo(worldCorners[0].x, worldCorners[0].y);
    for (let i = 1; i < 4; i++){
      graphics.lineTo(worldCorners[i].x, worldCorners[i].y);
    }
    graphics.closePath();
    graphics.strokePath();
  }

  window.Engine.HitboxSystem = HitboxSystem;
})();
