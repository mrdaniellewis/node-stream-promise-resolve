/* eslint-env node, jest */
/* eslint-disable arrow-body-style */
const { Transform } = require('stream');
const { Collect } = require('stream-collect');
const Resolve = require('./');

function arrayToStream(array) {
  const stream = new Transform({
    objectMode: true,
    transform(chunk, encoding, callback) {
      this.push(chunk);
      callback();
    },
  });

  array.forEach(item => stream.write(item));
  stream.end();
  return stream;
}

function defer() {
  let resolve;
  let reject;
  const promise = new Promise((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  promise.resolve = (value) => {
    resolve(value);
    return promise;
  };
  promise.reject = (value) => {
    reject(value);
    return promise;
  };
  return promise;
}

describe('Resolve', () => {
  describe('resolve returns objects', () => {
    it('behaves as an object stream', () => {
      return arrayToStream([1, 2, 3])
        .pipe(new Resolve({ resolve: value => value }))
        .pipe(new Collect({ objectMode: true }))
        .collect()
        .then(values => expect(values).toEqual([1, 2, 3]));
    });
  });

  describe('resolve returns promises', () => {
    it('behaves as an object stream', () => {
      return arrayToStream([1, 2, 3])
        .pipe(new Resolve({ resolve: value => Promise.resolve(value) }))
        .pipe(new Collect({ objectMode: true }))
        .collect()
        .then(values => expect(values).toEqual([1, 2, 3]));
    });
  });

  describe('resolve returns thenables', () => {
    it('behaves as an object stream', () => {
      return arrayToStream([1, 2, 3])
        .pipe(new Resolve({ resolve: value => ({ then(fn) { fn(value); } }) }))
        .pipe(new Collect({ objectMode: true }))
        .collect()
        .then(values => expect(values).toEqual([1, 2, 3]));
    });
  });

  describe('maxParallel option', () => {
    it('caps the maximum parallel promises', () => {
      let running = 0;
      const input = Array(1000).fill().map((_, i) => i);
      const maxParallel = 10;
      return arrayToStream(input)
        .pipe(new Resolve({
          maxParallel,
          resolve(value) {
            ++running;
            return Promise.resolve()
              .then(() => {
                expect(running <= maxParallel);
              })
              .then(() => {
                --running;
                return value;
              });
          },
        }))
        .pipe(new Collect({ objectMode: true }))
        .collect()
        .then(values => expect(values).toEqual(input));
    });

    describe('when infinite', () => {
      it('does not cap the maximum parallel promises', () => {
        let running = 0;
        let maxRunning = 0;
        const input = Array(1000).fill().map((_, i) => i);
        return arrayToStream(input)
          .pipe(new Resolve({
            maxParallel: Infinity,
            resolve(value) {
              ++running;
              return Promise.resolve()
                .then(() => {
                  if (running > maxRunning) {
                    maxRunning = running;
                  }
                })
                .then(() => {
                  --running;
                  return value;
                });
            },
          }))
          .pipe(new Collect({ objectMode: true }))
          .collect()
          .then(values => expect(values).toEqual(input))
          .then(() => expect(maxRunning).toEqual(1000));
      });
    });
  });

  describe('when resolve produces an error', () => {
    it('passes emits the error on the stream', () => {
      const spy = jest.fn();
      const stream = new Resolve({ resolve: value => Promise.reject(value) });
      return arrayToStream([1, 2, 3])
        .pipe(stream)
        .on('error', spy)
        .pipe(new Collect({ objectMode: true }))
        .collect()
        .then(values => expect(values).toEqual([]))
        .then(() => {
          expect(spy).toHaveBeenCalledTimes(3);
          expect(spy.mock.calls).toEqual([[1, stream], [2, stream], [3, stream]]);
        });
    });

    it('allows errors to be inserted into the stream', () => {
      return arrayToStream([1, 2, 3])
        .pipe(new Resolve({ resolve: value => Promise.reject(value) }))
        .on('error', (e, stream) => stream.push(e))
        .pipe(new Collect({ objectMode: true }))
        .collect()
        .then(values => expect(values).toEqual([1, 2, 3]));
    });
  });

  describe('maintainOrder option', () => {
    describe('when not provided', () => {
      it('maintains order', () => {
        const one = defer();
        const two = defer();
        const promise = arrayToStream([one, two])
          .pipe(new Resolve({ resolve: value => value, maxParallel: 2 }))
          .pipe(new Collect({ objectMode: true }))
          .collect()
          .then(values => expect(values).toEqual([1, 2]));

        setTimeout(() => {
          two.resolve(2);
          one.resolve(1);
        }, 0);
        return promise;
      });
    });

    describe('when truthy', () => {
      it('maintains order', () => {
        const one = defer();
        const two = defer();
        const promise = arrayToStream([one, two])
          .pipe(new Resolve({ resolve: value => value, maintainOrder: 'true', maxParallel: 2 }))
          .pipe(new Collect({ objectMode: true }))
          .collect()
          .then(values => expect(values).toEqual([1, 2]));

        setTimeout(() => {
          two.resolve(2);
          one.resolve(1);
        }, 0);
        return promise;
      });
    });

    describe('when falsey', () => {
      it('does not maintain order', () => {
        const one = defer();
        const two = defer();
        const promise = arrayToStream([one, two])
          .pipe(new Resolve({ resolve: value => value, maintainOrder: 0, maxParallel: 2 }))
          .pipe(new Collect({ objectMode: true }))
          .collect()
          .then(values => expect(values).toEqual([2, 1]));

        setTimeout(() => {
          two.resolve(2);
          one.resolve(1);
        }, 0);
        return promise;
      });
    });
  });

  describe('objectMode option', () => {
    describe('when false', () => {
      it('acts as a buffer based stream', () => {
        return arrayToStream(['1', '2', '3'])
          .pipe(new Resolve({ resolve: value => value, objectMode: false }))
          .pipe(new Collect())
          .collect()
          .then((values) => {
            expect(values.toString()).toEqual('123');
            expect(values).toBeInstanceOf(Buffer);
          });
      });
    });

    describe('when readableObjectMode is false', () => {
      it('acts as a buffer based stream', () => {
        return arrayToStream(['1', '2', '3'])
          .pipe(new Resolve({ resolve: value => value, readableObjectMode: false }))
          .pipe(new Collect())
          .collect()
          .then((values) => {
            expect(values.toString()).toEqual('123');
            expect(values).toBeInstanceOf(Buffer);
          });
      });
    });

    describe('when writeableObjectMode is false', () => {
      it('acts as a buffer based stream', () => {
        return arrayToStream(['1', '2', '3'])
          .pipe(new Resolve({ resolve: value => value, writableObjectMode: false }))
          .pipe(new Collect())
          .collect()
          .then((values) => {
            expect(values.toString()).toEqual('123');
            expect(values).toBeInstanceOf(Buffer);
          });
      });
    });
  });

  describe('as a constructor', () => {
    class ExtendedResolve extends Resolve {
      _resolve(value) {
        return Promise.resolve(value);
      }
    }

    it('behaves as an object stream', () => {
      return arrayToStream([1, 2, 3])
        .pipe(new ExtendedResolve())
        .pipe(new Collect({ objectMode: true }))
        .collect()
        .then(values => expect(values).toEqual([1, 2, 3]));
    });
  });
});
