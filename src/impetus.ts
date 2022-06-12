const stopThresholdDefault = 0.3;
const bounceDeceleration = 0.04;
const bounceAcceleration = 0.11;

// fixes weird safari 10 bug where preventDefault is prevented
// @see https://github.com/metafizzy/flickity/issues/457#issuecomment-254501356
window.addEventListener('touchmove', () => {});

type typeUpdateCallback = (targetX: number, targetY: number) => void;
type typeStopCallback = (sourceElement: HTMLElement) => void;
type typeSimpleEvent = {
    x: number;
    y: number;
    id: number | null;
};
type typeBound = {
    min: number;
    max: number;
}
type typeCoordinate = {
    x: number;
    y: number;
}

type ImpetusConstructorParam = {
  source: HTMLElement,
  sourceId: string,
  update: typeUpdateCallback,
  stop?: typeStopCallback,
  multiplier?: number,
  friction?: number,
  initialValues?: typeCoordinate,
  boundX?: typeBound,
  boundY?: typeBound,
  bounce?: boolean
}
type typeTrackingPoint = {
    x: number
    y: number
    time: number
}

export class Impetus {
    sourceElement: HTMLElement;
    updateCallBack: typeUpdateCallback;
    stopCallBack: typeStopCallback | undefined;
    multiplier: number;
    friction: number;
    initialValues: typeCoordinate | undefined;
    boundX: typeBound | undefined;
    boundY: typeBound | undefined;
    bounce: boolean
    paused: boolean = false;
    targetX: number = 0;
    targetY: number = 0;
    stopThreshold: number;
    pointerId: number | null = null;
    pointerActive: boolean = false;
    pointerLastX!: number;
    pointerLastY!: number;
    pointerCurrentX!: number;
    pointerCurrentY!: number;
//FIX IT. need to make type "List"
    trackingPoints: typeTrackingPoint[] = [];
    decelerating: boolean = false;
    decVelX!: number;
    decVelY!: number;

    ticking: boolean = false;

    constructor(argsObject:ImpetusConstructorParam) {
        //deconstructing
        var {
            source,
            sourceId,
            update,
            stop,
            multiplier = 1,
            friction = 0.92,
            initialValues,
            boundX,
            boundY,
            bounce = true
        } = argsObject;

        if (!source && typeof sourceId === 'string') {
            source = document.querySelector(sourceId)!;
        }

        if (!source) {
            throw new Error('IMPETUS: source not found.');
        }
        if (!update) {
            throw new Error('IMPETUS: update function not defined.');
        }        

        this.sourceElement = source;
        this.updateCallBack = update;
        this.stopCallBack = stop;
        this.multiplier = multiplier;
        this.friction = friction;
        this.initialValues = initialValues;
        this.bounce = bounce;
        this.stopThreshold = stopThresholdDefault * multiplier;
 
        if (initialValues) {
            if (initialValues.x) {
                this.targetX = initialValues.x;
            }
            if (initialValues.y) {
                this.targetY = initialValues.y;
            }
            this.callUpdateCallback();
        }
        // Initialize bound values
        if (boundX) {
            this.boundX = boundX;
        }
        if (boundY) {
            this.boundY = boundY;
        }
        this.stepDecelAnim = this.stepDecelAnim.bind(this)
        this.updateAndRender = this.updateAndRender.bind(this);

        this.onDown = this.onDown.bind(this);
        this.onMove = this.onMove.bind(this);
        this.onUp = this.onUp.bind(this);
        this.sourceElement.addEventListener('touchstart', this.onDown);
        this.sourceElement.addEventListener('mousedown', this.onDown);
  }

    /**
    * In edge cases where you may need to
    * reinstanciate Impetus on the same sourceElement
    * this will remove the previous event listeners
    */
    destroy(): null {
        try {
          this.sourceElement!.removeEventListener('touchstart', this.onDown as EventListener);
          this.sourceElement!.removeEventListener('mousedown', this.onDown as EventListener);
        }
        catch(error) {
          console.log("ERROR:");
          console.log(error);
          throw new Error("sourceElement not defined?");
        }
        this.cleanUpRuntimeEvents();

        // however it won't "destroy" a reference
        // to instance if you'd like to do that
        // it returns null as a convinience.
        // ex: `instance = instance.destroy();`
        return null;
    };

    /**
   * Disable movement processing
   * @public
   */
    pause() {
        this.cleanUpRuntimeEvents();
        this.pointerActive = false;
        this.paused = true;
    };

    /**
     * Enable movement processing
     * @public
    */
    resume() {
        this.paused = false;
    }
    /**
    * Update the current x and y values
    * @public
    * @param {Number} x
    * @param {Number} y
    */
    setValues(x: number, y: number) {
        //FIX IT. watch it. maybe need to remove type checking
        if (typeof x === 'number') {
            this.targetX = x;
        }
        if (typeof y === 'number') {
            this.targetY = y;
        }
    };

    /**
     * Update the multiplier value
     * @public
     * @param {Number} val
    */
    setMultiplier(val: number) {
        this.multiplier = val;
        this.stopThreshold = stopThresholdDefault * this.multiplier;
     };

    /**
    * Update boundX value
    * @public
    * @param { number[] } boundX
    */
    setBoundX(bound: typeBound) {
        this.boundX = bound;
    };

   /**
    * Update boundY value
    * @public
    * @param { number[] } boundY
    */
    setBoundY(bound: typeBound) {
        this.boundY = bound;
    };

    /**
    * Removes all events set by this instance during runtime
    */
    cleanUpRuntimeEvents() {
        // Remove all touch events added during 'onDown' as well.
        let passiveSupported = getPassiveSupported();
        let passiveParam: object | boolean;
        if (passiveSupported)
            passiveParam = { passive: false };
        else
            passiveParam = false;
        document.removeEventListener(
            'touchmove',
            this.onMove as EventListener,
            passiveParam
        );
        document.removeEventListener('touchend', this.onUp);
        document.removeEventListener('touchcancel', this.stopTracking);
        document.removeEventListener(
            'mousemove',
            this.onMove as EventListener,
            passiveParam
            );
        document.removeEventListener('mouseup', this.onUp);
   }
    /**
     * Add all required runtime events
     */
    addRuntimeEvents() {
        this.cleanUpRuntimeEvents();

      // @see https://developers.google.com/web/updates/2017/01/scrolling-intervention
        document.addEventListener(
            'touchmove',
            this.onMove,
            getPassiveSupported() ? { passive: false } : false
        );
        document.addEventListener('touchend', this.onUp);
        document.addEventListener('touchcancel', this.stopTracking);
        document.addEventListener(
            'mousemove',
            this.onMove,
            getPassiveSupported() ? { passive: false } : false
        );
        document.addEventListener('mouseup', this.onUp);
    }
    /**
     * Executes the update function
     */
    callUpdateCallback() {
        this.updateCallBack.call(this.sourceElement, this.targetX, this.targetY);
    }

   /**
     * Creates a custom normalized event object from touch and mouse events
     * @param  {Event} ev Event
     * @returns {typeSimpleEvent} with x, y, and id properties
     */
    normalizeEvent(ev: MouseEvent | TouchEvent): typeSimpleEvent {
        if ('targetTouches' in ev) {
            const touch = ev.targetTouches[0] || ev.changedTouches[0];
            return {
                x: touch.clientX,
                y: touch.clientY,
                id: touch.identifier
            };
        }
        else {
            // mouse events
            return {
                x: ev.clientX,
                y: ev.clientY,
                id: null
            };
        }
    }

    /**
     * Initializes movement tracking
     * @param  {MouseEvent | TouchEvent} ev Event
     */
    onDown(ev: MouseEvent | TouchEvent) {
        const event: typeSimpleEvent = this.normalizeEvent(ev);
        if (!this.pointerActive && !this.paused) {
          this.pointerActive = true;
          this.decelerating = false;
          this.pointerId = event.id;
  
          this.pointerLastX = this.pointerCurrentX = event.x;
          this.pointerLastY = this.pointerCurrentY = event.y;
          this.trackingPoints = [];
          this.addTrackingPoint(this.pointerLastX, this.pointerLastY);
  
          this.addRuntimeEvents();
        }
      }
    /**
     * Handles move events
     * @param  {MouseEvent | TouchEvent} ev Event
     */
    onMove(ev: MouseEvent | TouchEvent) {
        ev.preventDefault();
        const event: typeSimpleEvent = this.normalizeEvent(ev);
  
        if (this.pointerActive && event.id === this.pointerId) {
          this.pointerCurrentX = event.x;
          this.pointerCurrentY = event.y;
          this.addTrackingPoint(this.pointerLastX, this.pointerLastY);
          this.requestTick();
        }
    }
    /**
     * Handles up/end events
     * @param {MouseEvent | TouchEvent} ev Event
     */
    onUp(ev: MouseEvent | TouchEvent) {
        const event: typeSimpleEvent = this.normalizeEvent(ev);
  
        if (this.pointerActive && event.id === this.pointerId) {
          this.stopTracking();
        }
    }
    /**
     * Stops movement tracking, starts animation
     */
    stopTracking() {
        this.pointerActive = false;
        this.addTrackingPoint(this.pointerLastX, this.pointerLastY);
        this.startDecelAnim();
  
        this.cleanUpRuntimeEvents();
    }
    
    /**
     * Records movement for the last 100ms
     * @param {number} x
     * @param {number} y 
     */
    addTrackingPoint(x: number, y: number) {
        const time = Date.now();
        while (this.trackingPoints.length > 0) {
          if (time - this.trackingPoints[0].time <= 100) {
            break;
          }
          this.trackingPoints.shift();
        }
  
        this.trackingPoints.push({ x, y, time });
    }
     /**
     * Calculate new values, call update function
     */
    updateAndRender() {
        const pointerChangeX = this.pointerCurrentX - this.pointerLastX;
        const pointerChangeY = this.pointerCurrentY - this.pointerLastY;
  
        this.targetX += pointerChangeX * this.multiplier;
        this.targetY += pointerChangeY * this.multiplier;
  
        if (this.bounce) {
          const diff = this.checkBounds();
          if (diff.x !== 0) {
            this.targetX -= pointerChangeX * this.dragOutOfBoundsMultiplier(diff.x) * this.multiplier;
          }
          if (diff.y !== 0) {
            this.targetY -= pointerChangeY * this.dragOutOfBoundsMultiplier(diff.y) * this.multiplier;
          }
        } else {
          this.checkBounds(true);
        }
  
        this.callUpdateCallback();
  
        this.pointerLastX = this.pointerCurrentX;
        this.pointerLastY = this.pointerCurrentY;
        this.ticking = false;
    }
    /**
     * Returns a value from around 0.5 to 1, based on distance
     * @param {number} val
     */
    dragOutOfBoundsMultiplier(val: number) {
        return 0.000005 * Math.pow(val, 2) + 0.0001 * val + 0.55;
    }
    /**
     * prevents animating faster than current framerate
     */
    requestTick() {
        if (!this.ticking) {
          this.requestAnimFrame.call(window, this.updateAndRender)
        }
        this.ticking = true;
    }
    /**
     * Determine position relative to bounds
     * @param {boolean} restrict Whether to restrict target to bounds
     * @returns 
     */
    checkBounds(restrict?: boolean): { x: number; y: number; inBounds: boolean; } {
        let xDiff = 0;
        let yDiff = 0;
        if (this.boundX) {
            if (this.boundX.min !== undefined && this.targetX < this.boundX.min) {
                xDiff = this.boundX.min - this.targetX;
            }
            else
                if (this.boundX.max !== undefined && this.targetX > this.boundX.max) {
                    xDiff = this.boundX.max - this.targetX;
                }
        }
        if (this.boundY) {
            if (this.boundY.min !== undefined && this.targetY < this.boundY.min) {
                yDiff = this.boundY.min - this.targetY;
            }
            else
                if (this.boundY.max !== undefined && this.targetY > this.boundY.max) {
                    yDiff = this.boundY.max - this.targetY;
                }
        }

        if (restrict) {
          if (xDiff !== 0) {
            this.targetX = xDiff > 0 ? this.boundX!.min : this.boundX!.max;
          }
          if (yDiff !== 0) {
            this.targetY = yDiff > 0 ? this.boundY!.min : this.boundY!.max;
          }
        }
  
        return {
          x: xDiff,
          y: yDiff,
          inBounds: xDiff === 0 && yDiff === 0
        };
    }
    /**
     * Initialize animation of values coming to a stop
     */
    startDecelAnim() {
        const firstPoint = this.trackingPoints[0];
        const lastPoint = this.trackingPoints[this.trackingPoints.length - 1];
  
        const xOffset = lastPoint.x - firstPoint.x;
        const yOffset = lastPoint.y - firstPoint.y;
        const timeOffset = lastPoint.time - firstPoint.time;
  
        const D = timeOffset / 15 / this.multiplier;
  
        this.decVelX = xOffset / D || 0; // prevent NaN
        this.decVelY = yOffset / D || 0;
  
        const diff = this.checkBounds();
  
        if (Math.abs(this.decVelX) > 1 || Math.abs(this.decVelY) > 1 || !diff.inBounds) {
          this.decelerating = true;
          this.requestAnimFrame.call(window, this.stepDecelAnim);
        }
        else
            if (this.stopCallBack) {
                this.stopCallBack(this.sourceElement);
            }
    }
    /**
     * Animates values slowing down
     */
    stepDecelAnim() {
        if (!this.decelerating) {
          return;
        }
  
        this.decVelX *= this.friction;
        this.decVelY *= this.friction;
  
        this.targetX += this.decVelX;
        this.targetY += this.decVelY;
  
        const diff = this.checkBounds();
  
        if (
          Math.abs(this.decVelX) > this.stopThreshold
          || Math.abs(this.decVelY) > this.stopThreshold
          || !diff.inBounds
        ) {
          if (this.bounce) {
            const reboundAdjust = 2.5;
  
            if (diff.x !== 0) {
              if (diff.x * this.decVelX <= 0) {
                this.decVelX += diff.x * bounceDeceleration;
              } else {
                const adjust = diff.x > 0 ? reboundAdjust : -reboundAdjust;
                this.decVelX = (diff.x + adjust) * bounceAcceleration;
              }
            }
            if (diff.y !== 0) {
              if (diff.y * this.decVelY <= 0) {
                this.decVelY += diff.y * bounceDeceleration;
              } else {
                const adjust = diff.y > 0 ? reboundAdjust : -reboundAdjust;
                this.decVelY = (diff.y + adjust) * bounceAcceleration;
              }
            }
          } else {
            if (diff.x !== 0) {
              if (diff.x > 0) {
                this.targetX = this.boundX!.min;
              } else {
                this.targetX = this.boundX!.max;
              }
              this.decVelX = 0;
            }
            if (diff.y !== 0) {
              if (diff.y > 0) {
                this.targetY = this.boundY!.min;
              } else {
                this.targetY = this.boundY!.max;
              }
              this.decVelY = 0;
            }
          }
  
          this.callUpdateCallback();
  
          this.requestAnimFrame.call(window,this.stepDecelAnim);
        } else {
            this.decelerating = false;
            if (this.stopCallBack) {
                this.stopCallBack(this.sourceElement);
            }
        }
    }

    /**
    * @see http://www.paulirish.com/2011/requestanimationframe-for-smart-animating/
    */
    requestAnimFrame = (function () {
        return (
          window.requestAnimationFrame
      /*
      //have assumption that in 2022 we don't need it... but I leave here setTimeout ;)
          || window.webkitRequestAnimationFrame
          || window.mozRequestAnimationFrame
      */
          || function (callback) {
            window.setTimeout(callback, 1000 / 60);
          }
        );
      }());
}



let getPassiveSupported = function() {
  let passiveSupported = false;

  try {
    const options = Object.defineProperty({}, 'passive', {
      get() {
        passiveSupported = true;
      }
    });

    window.addEventListener('test', fakeWindowListener, options);
  } catch (err) {}

  getPassiveSupported = () => passiveSupported;
  return passiveSupported;
}
/**
 * trick for window.addEventListener('test', null, opts);
 * no param of type 'null' in declarations
 */
function fakeWindowListener(){}