const { Transform } = require('stream');

class Resolve extends Transform {
  constructor(options = {}) {
    const {
      resolve, objectMode, readableObjectMode, writableObjectMode,
      maintainOrder = true, maxParallel = 1,
    } = options;
    if (objectMode === undefined && readableObjectMode === undefined && writableObjectMode === undefined) {
      options.objectMode = true;
    }
    super(options);
    if (resolve) {
      this._resolve = resolve;
    }
    this._resolveState = {
      queued: [],
      running: 0,
      callback: null,
      maxParallel,
      maintainOrder,
    };
  }

  _queue(promise) {
    const state = this._resolveState;
    const { queued } = state;
    const resolution = promise
      .then((value) => {
        if (state.maintainOrder) {
          resolution.value = value;
          resolution.resolved = true;

          while (queued[0] && queued[0].resolved) {
            this.push(queued.shift().value);
          }
        } else {
          this.push(value);
          queued.splice(queued.indexOf(resolution), 1);
        }
      })
      .catch((e) => {
        queued.splice(queued.indexOf(resolution), 1);

        // Emitting an error unpipes this stream
        // This hack will repipe the stream
        const unpipe = source => source.pipe(this);
        this.on('unpipe', unpipe);
        this.emit('error', e, this);
        this.removeListener('unpipe', unpipe);
      })
      .then(() => {
        --state.running;
        if (state.callback) {
          const delayedCallback = state.callback;
          state.callback = null;
          delayedCallback();
        }
      });

    queued.push(resolution);
  }

  _transform(ob, encoding, callback) {
    const state = this._resolveState;
    ++state.running;

    this._queue(Promise.resolve(this._resolve(ob, encoding)));
    if (state.running >= state.maxParallel) {
      state.callback = callback;
    } else {
      callback();
    }
  }

  _flush(callback) {
    Promise.all(this._resolveState.queued).then(() => callback());
  }

  _resolve() {
    throw new Error('Not implemented. Supply a `resolve` function to the constructor or override this method');
  }
}

module.exports = Resolve;
