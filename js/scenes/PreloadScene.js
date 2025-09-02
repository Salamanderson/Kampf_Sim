(function(){
  const PreloadScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function PreloadScene(){
      Phaser.Scene.call(this, { key: 'PreloadScene' });
    },
    preload: function(){
      // Placeholder-Text
      const { width, height } = this.scale.gameSize;
      this.add.text(width/2, height/2, 'Lade Platzhalter...\n(keine Assets nötig)', {
        fontFamily: 'sans-serif', fontSize: 20, color: '#dfe6ff', align: 'center'
      }).setOrigin(0.5);
    },
    create: function(){
      // Weiter zur FightScene
      this.scene.start('FightScene');
    }
  });
  window.Scenes.PreloadScene = PreloadScene;
})();
