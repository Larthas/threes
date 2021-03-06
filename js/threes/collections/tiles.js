define([
  'jquery'
, 'underscore'
, 'backbone'
, 'threes/app'
, 'threes/models/tile'
, 'threes/modules/matrix_manager'
], function($, _, Backbone, app, TileModel, MatrixManager) {

  var Tiles = Backbone.Collection.extend({
    model: TileModel
  , initialize: function(models, options) {
      var self = this
      this.plate = options.plate
      this.playingHub = options.playingHub
      var plateSize = options.plateSize

      this.matrixManager = new MatrixManager(plateSize.row, plateSize.column, {
        conflictTest: function(m1, m2) {
          if(!m1 || !m2) {
            return true
          }
          var n1 = m1.get('number')
          var n2 = m2.get('number')
          if(n1 + n2 === 3) {
            return true
          } else if(n1 + n2 >= 6 && n1 === n2) {
            return true
          }
          return false
        }
      })
      this.matrixManager.on('model:merge', function(model, toBeMerged) {
        model.merge(toBeMerged)
      })
      this.matrixManager.on('model:moveTo', function(model, m, n) {
        model.moveTo(m, n)
      })

      this.on('add', function(model) {
        this.matrixManager.set(model, model.get('m'), model.get('n'))
      }, this)
    }
  , newModel: function(number, m, n) {
      return new this.model({
        number: number, m: m, n: n
      }, { plate: this.plate })
    }
  , addOne: function(number, m, n) {
      if(this.matrixManager.getAt(m, n)) {
        return false
      }
      var model = this.newModel(number, m, n)
      this.add(model)
      return true
    }
  , flyInOne: function(number, m, n, direction) {
      if(this.matrixManager.getAt(m, n)) {
        return false
      }
      var startM = m
      var startN = n
      switch (direction) {
        case 'up':    startM++; break;
        case 'right': startN--; break;
        case 'down':  startM--; break;
        case 'left':  startN++; break;
        default: break;
      }
      var model = this.newModel(number, startM, startN)
      model.moveTo(m, n)
      model.once('move:done', function() {
        this.add(model)
        this.playingHub.trigger('round:ready')
      }, this)
      return true
    }
  , preview: function(direction, distance) {
      var movables = this.matrixManager.getMovables(direction)
      if(!movables.length) {
        this.each(function(model) {
          model.view.stretch(direction, distance)
        })
      }
      _.each(movables, function(model) {
        model.view.preview(direction, distance)
      })
    }
  , previewInHalf: function(direction) {
      var movables = this.matrixManager.getMovables(direction)
      _.each(movables, function(model) {
        model.view.previewInHalf(direction)
      })
      return !!movables.length
    }
  , move: function(direction, distance) {
      var movables = this.matrixManager.getMovables(direction)
      if(!movables.length) {
        // get 'stretch' back
        this.each(function(model) {
          model.view.resetStretch()
        })
        return
      }
      var canceled = false
      var tileSize = app.getTileSize()
      switch (direction) {
        case 'up':    canceled = tileSize.height / 3 > distance; break;
        case 'right': canceled = tileSize.width / 3 > distance; break;
        case 'down':  canceled = tileSize.height / 3 > -distance; break;
        case 'left':  canceled = tileSize.width / 3 > -distance; break;
        default: break;
      }
      if(canceled) {
        _.each(movables, function(model) {
          model.trigger('change_back')
        })
        return
      }
      app.trigger('swiper:freeze')
      this.matrixManager.doMove(direction)

      var self = this
      this.on('move:done', _.after(movables.length, function() {
        // after all animation is done, run once
        self.playingHub.trigger('round:finish', direction)
        self.highlightMax()
        self.off('move:done')
      }))
    }
  , anyMovable: function() {
      var self = this
      var allMovablesCounts = _.map(['up', 'right', 'down', 'left']
        , function(direction) {
          return self.matrixManager.getMovables(direction).length
        })
      return _.any(allMovablesCounts)
      return true
    }
  , getMaxNumber: function() {
      return this.max(function(model) {
        return model.get('number')
      }).get('number')
    }
  , highlightMax: function() {
      var max = this.getMaxNumber()
      if(max <= 3) {
        return
      }
      this.each(function(model) {
        model.view.unhighlight()
      })
      var maxArr = this.filterByNumber(max)
      _.each(maxArr, function(model) {
        model.view.highlight()
      })
    }
  , filterByNumber: function(number) {
      return this.filter(function(model) {
        return model.get('number') === number
      })
    }
  , showScore: function() {
      // first, fix the z-index
      var modelMatrix = this.matrixManager.getAll()
      _.each(modelMatrix, function(row, n) {
        _.each(row, function(model, m) {
          if(model && model.view) {
            model.view.setZ(n+m)
          }
        })
      })
      var self = this
      var max = this.getMaxNumber()
      var total = 0
      var showNext = function(current) {
        if(current > max) {
          self.playingHub.trigger('game:score:done', total)
          return
        }
        var arr = self.filterByNumber(current)
        _.each(arr, function(model) {
          model.view.showScore()
        })
        if(!arr.length) {
          showNext(current * 2)
          return
        }
        self.on('score:shown', _.after(arr.length, function() {
          self.off('score:shown')
          total += arr.length * self.model.prototype.getScore(current)
          showNext(current * 2)
        }))
      }
      showNext(3)
    }
  })

  return Tiles
})