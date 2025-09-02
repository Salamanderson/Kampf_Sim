(function(){
  function FeelSystem(scene){
    this.scene = scene;
    this.hitstopFrames = 0;
    this._savedVelocity = new Map();
  }

  FeelSystem.prototype.hitstop = function(frames){
    // Additiv clampen
    this.hitstopFrames = Math.min(this.hitstopFrames + (frames|0), 20);
  };

  FeelSystem.prototype.onHit = function(h){
    // Hook für Partikel/SFX/SlowMo – aktuell nur von hitstop() + Kamera genutzt
  };

  // Wird ganz am Anfang von Scene.update() aufgerufen
  // Gibt true zurück, wenn Spielobjekte diese Frame "stehen" sollen.
  FeelSystem.prototype.preUpdate = function(delta){
    if (this.hitstopFrames > 0){
      this.hitstopFrames--;
      return true; // Fighter-Updates überspringen
    }
    return false;
  };

  window.Engine.FeelSystem = FeelSystem;
})();
