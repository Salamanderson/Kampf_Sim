// FILE: js/engine/Team.js
(function(){
  const Team = function(cfg){
    this.id = cfg.id || ('TEAM_'+Math.random().toString(36).slice(2,7));
    this.name = cfg.name || this.id;
    this.color = (typeof cfg.color === 'number') ? cfg.color : 0x00aaff;

    // Roster: Array of Fighter configs (not instances)
    this.roster = cfg.roster && Array.isArray(cfg.roster) ? cfg.roster : [];

    // Formation: Defines starting positions
    // Options: 'line', 'triangle', 'square', 'circle'
    this.formation = cfg.formation || 'line';

    // Stats
    this.morale = cfg.morale || 100; // 0-100, affects performance
    this.wins = cfg.wins || 0;
    this.losses = cfg.losses || 0;
  };

  // Calculate starting positions based on formation
  Team.prototype.getFormationPositions = function(count, arena, side){
    const positions = [];
    const A = arena;

    // Side: 'left' or 'right'
    const baseX = side === 'left' ? A.x - A.w*0.3 : A.x + A.w*0.3;
    const baseY = A.y;

    if (this.formation === 'line'){
      // Vertical line formation
      const spacing = Math.min(80, A.h / (count + 1));
      for (let i=0; i<count; i++){
        const offset = (i - (count-1)/2) * spacing;
        positions.push({ x: baseX, y: baseY + offset });
      }
    } else if (this.formation === 'triangle'){
      // Triangle formation (point forward)
      if (count === 1){
        positions.push({ x: baseX, y: baseY });
      } else if (count === 2){
        positions.push({ x: baseX, y: baseY - 40 });
        positions.push({ x: baseX, y: baseY + 40 });
      } else {
        // Front
        positions.push({ x: baseX + (side==='left'?30:-30), y: baseY });
        // Back row
        const backX = baseX + (side==='left'?-30:30);
        const spacing = 60;
        for (let i=1; i<count; i++){
          const offset = (i-1 - (count-2)/2) * spacing;
          positions.push({ x: backX, y: baseY + offset });
        }
      }
    } else if (this.formation === 'square'){
      // Box formation
      const spacing = 60;
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      let idx = 0;
      for (let r=0; r<rows && idx<count; r++){
        for (let c=0; c<cols && idx<count; c++){
          const offsetX = (c - (cols-1)/2) * spacing;
          const offsetY = (r - (rows-1)/2) * spacing;
          positions.push({ x: baseX + offsetX, y: baseY + offsetY });
          idx++;
        }
      }
    } else if (this.formation === 'circle'){
      // Circular formation
      const radius = 60;
      for (let i=0; i<count; i++){
        const angle = (i / count) * Math.PI * 2;
        positions.push({
          x: baseX + Math.cos(angle) * radius,
          y: baseY + Math.sin(angle) * radius
        });
      }
    }

    return positions;
  };

  // Record match result
  Team.prototype.recordWin = function(){
    this.wins++;
    this.morale = Math.min(100, this.morale + 5);
  };

  Team.prototype.recordLoss = function(){
    this.losses++;
    this.morale = Math.max(0, this.morale - 10);
  };

  // Apply morale bonus to fighter stats
  Team.prototype.getMoraleBonus = function(){
    // Morale affects stats: 100 morale = +10% stats, 50 morale = 0%, 0 morale = -10%
    const bonus = (this.morale - 50) / 500; // -0.1 to +0.1
    return {
      physAtk: 1 + bonus,
      energyAtk: 1 + bonus,
      moveSpeed: 1 + bonus
    };
  };

  window.Engine.Team = Team;
})();
