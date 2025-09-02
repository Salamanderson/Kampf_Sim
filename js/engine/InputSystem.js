(function(){
  // Für spätere Erweiterungen (Input-Buffer, Cancels, etc.)
  // Aktuell nicht genutzt, aber strukturell vorhanden.
  function InputSystem(){ this.buffer = []; this.maxFrames = 6; }
  InputSystem.prototype.enqueue = function(cmd){
    const frame = performance.now();
    this.buffer.push({cmd, t: frame});
    while (this.buffer.length > 32) this.buffer.shift();
  };
  InputSystem.prototype.clear = function(){ this.buffer.length = 0; };
  window.Engine.InputSystem = InputSystem;
})();
