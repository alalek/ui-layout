(function() {
'use strict';

var sizePattern = /\d+\s*(px|%)\s*$/i;

function isPercent(num) {
  return (num && angular.isString(num) && num.indexOf('%') > -1) ? true : false;
}

function parseFieldValue(obj, fieldName, value) {
  if (value !== undefined && !sizePattern.test(value)) {
    console.error('ui-layout: invalid size: ' + value);
  }
  if (isPercent(value)) {
    fieldName += 'Percents';
    value = value.substr(0, value.indexOf('%'));
  } else {
    fieldName += 'Pixels';
  }
  value = parseFloat(value);
  if (!isNaN(value)) {
    obj[fieldName] = Math.floor(value);
  }
}

function convertToPixels(percents, sz) {
  return sz * percents / 100;
}

/**
 * UI.Layout
 */
angular.module('ui.layout', [])
  .controller('uiLayoutCtrl', ['$scope', '$attrs', '$element', '$compile', '$parse', 'LayoutContainer', function uiLayoutCtrl($scope, $attrs, $element, $compile, $parse, LayoutContainer) {
    var ctrl = this;
    var opts = angular.extend({}, $scope.$eval($attrs.uiLayout), $scope.$eval($attrs.options));
    var animationFrameRequested;
    var moveDelta;

    // fixups to eliminate future checks
    opts.flow = opts.flow === 'column' ? opts.flow : 'row';
    opts.dividerSize = parseInt(opts.dividerSize) || 10; // default divider size set to 10
    ctrl.opts = opts;

    ctrl.containers = [];
    ctrl.splitbars = [];
    
    ctrl.movingSplitbar = null;
    ctrl.bounds = $element[0].getBoundingClientRect();
    ctrl.isUsingColumnFlow = opts.flow === 'column';
    ctrl.sizeProperties = !ctrl.isUsingColumnFlow ?
    { sizeProperty: 'height', offsetSize: 'offsetHeight', offsetPos: 'top', flowProperty: 'top', oppositeFlowProperty: 'bottom', mouseProperty: 'clientY', flowPropertyPosition: 'y' } :
    { sizeProperty: 'width', offsetSize: 'offsetWidth', offsetPos: 'left', flowProperty: 'left', oppositeFlowProperty: 'right', mouseProperty: 'clientX', flowPropertyPosition: 'x' };
    
    $element
      // Force the layout to fill the parent space
      // fix no height layout...
      .addClass('stretch')
      // set the layout css class
      .addClass('ui-layout-' + opts.flow);

    /**
     * Adds a container to the list of layout ctrl.containers.
     * @param container
     */
    ctrl.addContainer = function(container) {
      container.index = ctrl.containers.length; 
      ctrl.containers.push(container);
    };

    /**
     * Adds a splitbar to the list of layout ctrl.splitbars.
     * @param splitbar
     */
    ctrl.addSplitbar = function(splitbar) {
      splitbar.index = ctrl.splitbars.length; 
      ctrl.splitbars.push(splitbar);
    };

    function _loadLayout() {
      if ($attrs.uiLayoutStorage) {
        var storage_fn = $parse($attrs.uiLayoutStorage);
        var state = storage_fn($scope).get();
        if (state !== undefined) {
          if (state.containers.length !== ctrl.containers.length) {
            console.error("Saved ui-layout state is mismatched");
          } else {
            for (var i = 0, _max_i = ctrl.containers.length; i < _max_i; i++) {
              ctrl.containers[i].setState(state.containers[i]);
            }
          }
        }
      }
    }

    function _storeLayout() {
      if ($attrs.uiLayoutStorage) {
        var storage_fn = $parse($attrs.uiLayoutStorage);
        var state = {containers: []};
        for (var i = 0, _max_i = ctrl.containers.length; i < _max_i; i++) {
          state.containers[i] = ctrl.containers[i].getState();
        }
        storage_fn($scope).set(state);
      }
    }
    
    ctrl.initialSetup = function() {
      var i, _max_i;
      for (i = 0, _max_i = ctrl.containers.length - 1; i < _max_i; i++) {
        var e = angular.element('<div ui-splitbar><a><span class="glyphicon"></span></a><a><span class="glyphicon"></span></a></div>'); 
        ctrl.containers[i].element.after(e);
        $compile(e)($scope);
      }
      
      _loadLayout();
    };
    
    ctrl.destroy = function() {
      _storeLayout();
    };
    
    function calculateLayout() {
      var dividerSize = opts.dividerSize,
          elementSize = $element[0].getBoundingClientRect()[ctrl.sizeProperties.sizeProperty],
          availableSize = elementSize - (dividerSize * ctrl.splitbars.length),
          autoSize = availableSize,
          autoContainers = 0,
          i, _max_i, c, s, sz, minSize, maxSize;

      function inPixels(pixels, percents) {
        var v;
        if (pixels !== undefined)
          v = pixels;
        else if (percents !== undefined)
          v = convertToPixels(percents, availableSize);
        return v;
      }
      
      // calculate space for auto size containers
      for (i = 0, _max_i = ctrl.containers.length; i < _max_i; i++) {
        c = ctrl.containers[i];

        // verify size is properly set to pixels or percent
        sz = inPixels(c.sizePixels, c.sizePercents);
        minSize = inPixels(c.minSizePixels, c.minSizePercents);
        maxSize = inPixels(c.maxSizePixels, c.maxSizePercents);

        if (sz === undefined) {
          autoContainers++;
        } else {
          autoSize -= sz;
        }

        c.size = sz;
      }
      
      var fix = 1.0;
      if (autoSize < 0) {
        fix = (availableSize) / (availableSize - autoSize);
        autoSize = 0;
      }

      // set the final sizes
      var autoSize1 = Math.floor(autoSize / autoContainers);
      var currentOffset = 0;
      var collapseAddon = 0;
      for (i = 0; i < _max_i; i++) {
        c = ctrl.containers[i];
        if (c.size === undefined) {
          c.size = autoSize1;
        } else {
          c.size *= fix;
        }
        if (!c.collapsed) {
          c.offset = currentOffset;
          c.size += collapseAddon;
          currentOffset += c.size;
          collapseAddon = 0;
        } else if (c.collapseToBegin) {
          collapseAddon += c.size;
          c.offset = currentOffset;
          c.size = 0;
        } else {
          var prev = ctrl.containers[i - 1];
          do {
            s = ctrl.splitbars[prev.index];
            s.offset += c.size;
            if (!prev.collapsed) {
              prev.size += c.size;
              break;
            } else {
              prev.offset += c.size;
              prev = ctrl.containers[prev.index - 1];
            }
          } while (true);
          c.offset = currentOffset = currentOffset + c.size;
          c.size = 0;
          collapseAddon = 0;
        }
        
        s = ctrl.splitbars[i];
        if (s !== undefined) {
          s.offset = currentOffset;
          currentOffset += s.size;
        }
      }
    }
    
    function processMouseMove() {
      if (ctrl.movingSplitbar === undefined) {
        animationFrameRequested = undefined;
        return;
      }
      
      var dividerSize = parseInt(opts.dividerSize),
          elementSize = $element[0].getBoundingClientRect()[ctrl.sizeProperties.sizeProperty],
          availableSize = elementSize - (dividerSize * ctrl.splitbars.length),
          index = ctrl.movingSplitbar.index,
          moveDeltaPercents = moveDelta * 100 / availableSize,
          c = ctrl.containers[index],
          next = ctrl.containers[index + 1],
          maxSize = (c.size + next.size) * 100 / availableSize,
          percents;
      if (c.sizePixels !== undefined) {
        percents = (c.sizePixels + moveDelta) * 100 / availableSize;
        c.sizePixels = undefined;
      } else if (c.sizePercents === undefined) {
        percents = (c.size + moveDelta) * 100 / availableSize;
      } else {
        percents = c.sizePercents + moveDeltaPercents;
      }
      percents = Math.max(0, Math.min(percents, maxSize));
      c.sizePercents = percents;
      c = next;
      if (c.sizePixels !== undefined) {
        percents = (c.sizePixels - moveDelta) * 100 / availableSize;
        c.sizePixels = undefined;
      } else if (c.sizePercents === undefined) {
        percents = (c.size - moveDelta) * 100 / availableSize;
      } else {
        percents = c.sizePercents - moveDeltaPercents;
      }
      percents = Math.max(0, Math.min(percents, maxSize));
      c.sizePercents = percents;
      calculateLayout();
      $scope.$digest();

      // Enable a new animation frame
      animationFrameRequested = null;
    }

    ctrl.mouseDownHandler = function(splitbar) {
      var prev = ctrl.containers[splitbar.index],
          next = ctrl.containers[splitbar.index + 1];
      if (prev.collapsed || next.collapsed)
        return false; // TODO Allow to move splitbars near collapsed containers
      ctrl.movingSplitbar = splitbar;
      return true;
    };

    ctrl.mouseUpHandler = function(event) {
      if (ctrl.movingSplitbar !== undefined) {
        ctrl.movingSplitbar = undefined;
      }
      return event;
    };

    ctrl.mouseMoveHandler = function(mouseEvent) {
      var mousePos = mouseEvent[ctrl.sizeProperties.mouseProperty] ||
        (mouseEvent.originalEvent && mouseEvent.originalEvent[ctrl.sizeProperties.mouseProperty]) ||
        (mouseEvent.targetTouches ? mouseEvent.targetTouches[0][ctrl.sizeProperties.mouseProperty] : 0);

      moveDelta = mousePos - ctrl.movingSplitbar.offset;

      // Cancel previous rAF call
      if (animationFrameRequested) {
        window.cancelAnimationFrame(animationFrameRequested);
      }
      // Animate the page outside the event
      animationFrameRequested = window.requestAnimationFrame(processMouseMove);
    };

    /**
     * Sets the default size for each container.
     */
    ctrl.update = function() {
      calculateLayout();
    };

    /**
     * Toggles the container before the provided splitbar
     * @param splitbar
     * @returns {boolean}
     */
    ctrl.toggleBefore = function(splitbar) {
      var index = splitbar.index;
      var c = ctrl.containers[index];
      c.collapsed = !c.collapsed;
      c.collapseToBegin = c.collapsed ? true : undefined;
      $scope.$evalAsync(function() {
        ctrl.update();
      });
      return c.collapsed;
    };

    /**
     * Toggles the container after the provided splitbar
     * @param splitbar
     * @returns {boolean}
     */
    ctrl.toggleAfter = function(splitbar) {
      var index = splitbar.index + 1;
      var c = ctrl.containers[index];
      c.collapsed = !c.collapsed;
      c.collapseToBegin = c.collapsed ? false : undefined;
      $scope.$evalAsync(function() {
        ctrl.update();
      });
      return c.collapsed;
    };

    ctrl.getPreviousContainer = function(currentSplitbar) {
      return ctrl.containers[currentSplitbar.index];
    };
    ctrl.getNextContainer = function(currentSplitbar) {
      return ctrl.containers[currentSplitbar.index + 1];
    };

    return ctrl;
  }])

  .directive('uiLayout', ['$window', function($window) {
    return {
      restrict: 'AE',
      controller: 'uiLayoutCtrl',
      link: function(scope, element, attrs, ctrl) {
        ctrl.initialSetup();

        scope.$watch(function() {
          return element[0][ctrl.sizeProperties.offsetSize];
        }, function() {
          ctrl.update();
        });
        
        function onResize() {
          scope.$apply(function() {
            ctrl.update();
          });
        }
        angular.element($window).bind('resize', onResize);

        scope.$on('$destroy', function() {
          angular.element($window).unbind('resize', onResize);
          ctrl.destroy();
        });
      }
    };
  }])

  .directive('uiSplitbar', ['$document', 'LayoutContainer', function($document, LayoutContainer) {
    //chevron bootstrap classes
    var chevronLeft = 'glyphicon-chevron-left';
    var chevronRight = 'glyphicon-chevron-right';
    var chevronUp = 'glyphicon-chevron-up';
    var chevronDown = 'glyphicon-chevron-down';

    return {
      restrict: 'EAC',
      require: '^uiLayout',
      scope: {},
      link: function(scope, element, attrs, ctrl) {
        if (!element.hasClass('stretch')) element.addClass('stretch');
        if (!element.hasClass('ui-splitbar')) element.addClass('ui-splitbar');

        scope.splitbar = new LayoutContainer.Splitbar(element);
        ctrl.addSplitbar(scope.splitbar);

        //chevron <a> elements
        var backButton = angular.element(element.children()[0]);
        var forwardButton = angular.element(element.children()[1]);

        //chevron <span> elements
        angular.element(backButton.children()[0]).addClass(ctrl.isUsingColumnFlow ? 'glyphicon-chevron-left' : 'glyphicon-chevron-up');
        angular.element(forwardButton.children()[0]).addClass(ctrl.isUsingColumnFlow ? 'glyphicon-chevron-right' : 'glyphicon-chevron-down');

        var prevContainer = ctrl.getPreviousContainer(scope.splitbar),
            nextContainer = ctrl.getNextContainer(scope.splitbar);
        
        scope.$watchGroup([
        function() {
          return prevContainer.collapsed;
        },
        function() {
          return nextContainer.collapsed;
        },
        ], function(newValues, oldValues) {
          backButton.css('display', prevContainer.collapsed ? 'none' : 'inline');
          forwardButton.css('display', nextContainer.collapsed ? 'none' : 'inline');
        });
        
        backButton.on('click', function() {
          if (nextContainer.collapsed && !nextContainer.collapseToBegin)
            ctrl.toggleAfter(scope.splitbar);
          else
            ctrl.toggleBefore(scope.splitbar);
          scope.$parent.$digest();
        });

        forwardButton.on('click', function() {
          if (prevContainer.collapsed && prevContainer.collapseToBegin)
            ctrl.toggleBefore(scope.splitbar);
          else
            ctrl.toggleAfter(scope.splitbar);
          scope.$parent.$digest();
        });

        var mouseMove = function(event) {
          scope.$apply(function() {
            ctrl.mouseMoveHandler(event);
          });
        };
        
        element.on('mousedown touchstart', function(e) {
          if (e.target && e.target !== element[0])
            return;

          event.preventDefault();
          event.stopPropagation();

          scope.$apply(function() {
            if (ctrl.mouseDownHandler(scope.splitbar)) {
              $document.on('mousemove touchmove', mouseMove);
            }
          });
  
          return false;
        });

        $document.on('mouseup touchend', function(event) {
          scope.$apply(function() {
            ctrl.mouseUpHandler(event);
          });
          $document.off('mousemove touchmove', mouseMove);
        });

        scope.$watch('splitbar.size', function(newValue) {
          element.css(ctrl.sizeProperties.sizeProperty, newValue + 'px');
        });

        scope.$watch('splitbar.offset', function(newValue) {
          element.css(ctrl.sizeProperties.flowProperty, newValue + 'px');
        });
      }
    };

  }])

  .directive('uiLayoutContainer', ['LayoutContainer', function(LayoutContainer) {
    return {
      restrict: 'EAC',
      require: '^uiLayout',
      scope: {},

      compile: function(element) {
        return {
          pre: function(scope, element, attrs, ctrl) {
            scope.container = new LayoutContainer.Container(element, attrs, scope.$parent);
            ctrl.addContainer(scope.container);
          },
          post: function(scope, element, attrs, ctrl) {
            if (!element.hasClass('ui-layout-container')) element.addClass('ui-layout-container');
            if (!element.hasClass('stretch')) element.addClass('stretch');

            scope.$watch('container.size', function(newValue) {
              element.css(ctrl.sizeProperties.sizeProperty, newValue + 'px');
            });

            scope.$watch('container.offset', function(newValue) {
              element.css(ctrl.sizeProperties.flowProperty, newValue + 'px');
            });
          }
        };
      }
    };
  }])

  .factory('LayoutContainer', function($parse) {
    
    var containerStateEntries = 'collapsed collapseToBegin sizePixels sizePercents'.split(' ');

    function Container(element, attrs, evaluationScope) {
      this.index = -1; // filled by controller
      
      this.element = element;
      this.resizable = true;
      this.collapsed = evaluationScope.$eval(attrs.collapsed) || false;
      this.collapseToBegin = this.collapsed ? true : undefined;

      // final values in pixels (calculated by controller)
      this.offset = undefined; 
      this.size = undefined; 

      // initial / current values
      this.sizePixels = undefined;
      this.sizePercents = undefined;
      
      // constraints
      this.maxSizePixels = undefined;
      this.maxSizePercents = undefined;
      this.minSizePixels = undefined;
      this.minSizePercents = undefined;
      
      parseFieldValue(this, 'size', attrs.size);

      if (attrs.minSize !== undefined) {
        console.error('ui-layout: min-size is not supported');
      }
      if (attrs.maxSize !== undefined) {
        console.error('ui-layout: max-size is not supported');
      }
      //parseFieldValue(this, 'maxSize', attrs.maxSize);
      //parseFieldValue(this, 'minSize', attrs.minSize);
    }
    angular.extend(Container.prototype, {
      getState: function() {
        var self = this,
            res = {};
        angular.forEach(containerStateEntries, function(k) {
          res[k] = self[k];
        });
        return res;
      },
      setState: function(state) {
        var self = this;
        angular.forEach(containerStateEntries, function(k) {
          self[k] = state[k];
        });
      },      
    });

    function Splitbar(element) {
      this.index = -1; // filled by controller 
      
      this.element = element;
      this.size = 10;
      this.offset = 0;
    }
    
    return {
      Container: Container,
      Splitbar: Splitbar,
    };
  })
;

})();
