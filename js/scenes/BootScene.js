(function(){
  const BootScene = new Phaser.Class({
    Extends: Phaser.Scene,
    initialize: function BootScene(){
      Phaser.Scene.call(this, { key: 'BootScene' });
    },
    preload: function(){
      // Nichts zu laden – aber hier könnten Fonts/Atlas später kommen
    },
    create: function(){
      this.scene.start('PreloadScene');
    }
  });
  window.Scenes.BootScene = BootScene;
})();
