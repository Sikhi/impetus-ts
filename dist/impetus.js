const stopThresholdDefault = 0.3;
const bounceDeceleration = 0.04;
const bounceAcceleration = 0.11;
window.addEventListener('touchmove', () => { });
export class Impetus {
    sourceElement;
    updateCallBack;
    stopCallBack;
    multiplier;
    friction;
    boundX;
    boundY;
    bounce;
    paused = false;
    targetX = 0;
    targetY = 0;
    stopThreshold;
    pointerId = null;
    pointerActive = false;
    pointerLastX;
    pointerLastY;
    pointerCurrentX;
    pointerCurrentY;
    trackingPoints = [];
    decelerating = false;
    decVelX;
    decVelY;
    ticking = false;
    constructor(argsObject) {
        var { source, sourceId, update, stop, multiplier = 1, friction = 0.92, initialValues, boundX, boundY, bounce = true } = argsObject;
        if (!source && typeof sourceId === 'string') {
            source = document.querySelector(sourceId);
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
        if (boundX) {
            this.boundX = boundX;
        }
        if (boundY) {
            this.boundY = boundY;
        }
        this.stepDecelAnim = this.stepDecelAnim.bind(this);
        this.updateAndRender = this.updateAndRender.bind(this);
        this.onDown = this.onDown.bind(this);
        this.onMove = this.onMove.bind(this);
        this.onUp = this.onUp.bind(this);
        this.sourceElement.addEventListener('touchstart', this.onDown);
        this.sourceElement.addEventListener('mousedown', this.onDown);
    }
    destroy() {
        try {
            this.sourceElement.removeEventListener('touchstart', this.onDown);
            this.sourceElement.removeEventListener('mousedown', this.onDown);
        }
        catch (error) {
            console.log("ERROR:");
            console.log(error);
            throw new Error("sourceElement not defined?");
        }
        this.cleanUpRuntimeEvents();
        return null;
    }
    ;
    pause() {
        this.cleanUpRuntimeEvents();
        this.pointerActive = false;
        this.paused = true;
    }
    ;
    resume() {
        this.paused = false;
    }
    setValues(x, y) {
        if (typeof x === 'number') {
            this.targetX = x;
        }
        if (typeof y === 'number') {
            this.targetY = y;
        }
    }
    ;
    setMultiplier(val) {
        this.multiplier = val;
        this.stopThreshold = stopThresholdDefault * this.multiplier;
    }
    ;
    setBoundX(bound) {
        this.boundX = bound;
    }
    ;
    setBoundY(bound) {
        this.boundY = bound;
    }
    ;
    cleanUpRuntimeEvents() {
        let passiveSupported = getPassiveSupported();
        let passiveParam;
        if (passiveSupported)
            passiveParam = { passive: false };
        else
            passiveParam = false;
        document.removeEventListener('touchmove', this.onMove, passiveParam);
        document.removeEventListener('touchend', this.onUp);
        document.removeEventListener('touchcancel', this.stopTracking);
        document.removeEventListener('mousemove', this.onMove, passiveParam);
        document.removeEventListener('mouseup', this.onUp);
    }
    addRuntimeEvents() {
        this.cleanUpRuntimeEvents();
        document.addEventListener('touchmove', this.onMove, getPassiveSupported() ? { passive: false } : false);
        document.addEventListener('touchend', this.onUp);
        document.addEventListener('touchcancel', this.stopTracking);
        document.addEventListener('mousemove', this.onMove, getPassiveSupported() ? { passive: false } : false);
        document.addEventListener('mouseup', this.onUp);
    }
    callUpdateCallback() {
        this.updateCallBack.call(this.sourceElement, this.targetX, this.targetY);
    }
    normalizeEvent(ev) {
        if ('targetTouches' in ev) {
            const touch = ev.targetTouches[0] || ev.changedTouches[0];
            return {
                x: touch.clientX,
                y: touch.clientY,
                id: touch.identifier
            };
        }
        else {
            return {
                x: ev.clientX,
                y: ev.clientY,
                id: null
            };
        }
    }
    onDown(ev) {
        const event = this.normalizeEvent(ev);
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
    onMove(ev) {
        ev.preventDefault();
        const event = this.normalizeEvent(ev);
        if (this.pointerActive && event.id === this.pointerId) {
            this.pointerCurrentX = event.x;
            this.pointerCurrentY = event.y;
            this.addTrackingPoint(this.pointerLastX, this.pointerLastY);
            this.requestTick();
        }
    }
    onUp(ev) {
        const event = this.normalizeEvent(ev);
        if (this.pointerActive && event.id === this.pointerId) {
            this.stopTracking();
        }
    }
    stopTracking() {
        this.pointerActive = false;
        this.addTrackingPoint(this.pointerLastX, this.pointerLastY);
        this.startDecelAnim();
        this.cleanUpRuntimeEvents();
    }
    addTrackingPoint(x, y) {
        const time = Date.now();
        while (this.trackingPoints.length > 0) {
            if (time - this.trackingPoints[0].time <= 100) {
                break;
            }
            this.trackingPoints.shift();
        }
        this.trackingPoints.push({ x, y, time });
    }
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
        }
        else {
            this.checkBounds(true);
        }
        this.callUpdateCallback();
        this.pointerLastX = this.pointerCurrentX;
        this.pointerLastY = this.pointerCurrentY;
        this.ticking = false;
    }
    dragOutOfBoundsMultiplier(val) {
        return 0.000005 * Math.pow(val, 2) + 0.0001 * val + 0.55;
    }
    requestTick() {
        if (!this.ticking) {
            this.requestAnimFrame.call(window, this.updateAndRender);
        }
        this.ticking = true;
    }
    checkBounds(restrict) {
        let xDiff = 0;
        let yDiff = 0;
        if (this.boundX) {
            if (this.boundX.min !== undefined && this.targetX < this.boundX.min) {
                xDiff = this.boundX.min - this.targetX;
            }
            else if (this.boundX.max !== undefined && this.targetX > this.boundX.max) {
                xDiff = this.boundX.max - this.targetX;
            }
        }
        if (this.boundY) {
            if (this.boundY.min !== undefined && this.targetY < this.boundY.min) {
                yDiff = this.boundY.min - this.targetY;
            }
            else if (this.boundY.max !== undefined && this.targetY > this.boundY.max) {
                yDiff = this.boundY.max - this.targetY;
            }
        }
        if (restrict) {
            if (xDiff !== 0) {
                this.targetX = xDiff > 0 ? this.boundX.min : this.boundX.max;
            }
            if (yDiff !== 0) {
                this.targetY = yDiff > 0 ? this.boundY.min : this.boundY.max;
            }
        }
        return {
            x: xDiff,
            y: yDiff,
            inBounds: xDiff === 0 && yDiff === 0
        };
    }
    startDecelAnim() {
        const firstPoint = this.trackingPoints[0];
        const lastPoint = this.trackingPoints[this.trackingPoints.length - 1];
        const xOffset = lastPoint.x - firstPoint.x;
        const yOffset = lastPoint.y - firstPoint.y;
        const timeOffset = lastPoint.time - firstPoint.time;
        const D = timeOffset / 15 / this.multiplier;
        this.decVelX = xOffset / D || 0;
        this.decVelY = yOffset / D || 0;
        const diff = this.checkBounds();
        if (Math.abs(this.decVelX) > 1 || Math.abs(this.decVelY) > 1 || !diff.inBounds) {
            this.decelerating = true;
            this.requestAnimFrame.call(window, this.stepDecelAnim);
        }
        else if (this.stopCallBack) {
            this.stopCallBack(this.sourceElement);
        }
    }
    stepDecelAnim() {
        if (!this.decelerating) {
            return;
        }
        this.decVelX *= this.friction;
        this.decVelY *= this.friction;
        this.targetX += this.decVelX;
        this.targetY += this.decVelY;
        const diff = this.checkBounds();
        if (Math.abs(this.decVelX) > this.stopThreshold
            || Math.abs(this.decVelY) > this.stopThreshold
            || !diff.inBounds) {
            if (this.bounce) {
                const reboundAdjust = 2.5;
                if (diff.x !== 0) {
                    if (diff.x * this.decVelX <= 0) {
                        this.decVelX += diff.x * bounceDeceleration;
                    }
                    else {
                        const adjust = diff.x > 0 ? reboundAdjust : -reboundAdjust;
                        this.decVelX = (diff.x + adjust) * bounceAcceleration;
                    }
                }
                if (diff.y !== 0) {
                    if (diff.y * this.decVelY <= 0) {
                        this.decVelY += diff.y * bounceDeceleration;
                    }
                    else {
                        const adjust = diff.y > 0 ? reboundAdjust : -reboundAdjust;
                        this.decVelY = (diff.y + adjust) * bounceAcceleration;
                    }
                }
            }
            else {
                if (diff.x !== 0) {
                    if (diff.x > 0) {
                        this.targetX = this.boundX.min;
                    }
                    else {
                        this.targetX = this.boundX.max;
                    }
                    this.decVelX = 0;
                }
                if (diff.y !== 0) {
                    if (diff.y > 0) {
                        this.targetY = this.boundY.min;
                    }
                    else {
                        this.targetY = this.boundY.max;
                    }
                    this.decVelY = 0;
                }
            }
            this.callUpdateCallback();
            this.requestAnimFrame.call(window, this.stepDecelAnim);
        }
        else {
            this.decelerating = false;
            if (this.stopCallBack) {
                this.stopCallBack(this.sourceElement);
            }
        }
    }
    requestAnimFrame = (function () {
        return (window.requestAnimationFrame
            || function (callback) {
                window.setTimeout(callback, 1000 / 60);
            });
    }());
}
let getPassiveSupported = function () {
    let passiveSupported = false;
    try {
        const options = Object.defineProperty({}, 'passive', {
            get() {
                passiveSupported = true;
            }
        });
        window.addEventListener('test', fakeWindowListener, options);
    }
    catch (err) { }
    getPassiveSupported = () => passiveSupported;
    return passiveSupported;
};
function fakeWindowListener() { }
