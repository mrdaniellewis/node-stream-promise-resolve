# Stream promise resolve

[![npm version](https://badge.fury.io/js/stream-promise-resolve.svg)](http://badge.fury.io/js/stream-promise-resolve)

A transform stream that resolves using promises limiting concurrency.

This is useful, for say, a website crawler where you have a stream of pages to visit and want to limit the number of simultaneous requests.

```bash
npm install stream-promise-resolve
```

## Example

```js
const request = require('request-promise-native');
const Resolve = require('stream-promise-resolve');
const stream = // Some means of getting an object stream of urls

// Download our urls 10 at a time
stream
  .pipe(new Resolve({
    resolve: url => request(url),
    maxParallel: 10,  
  }))
  .pipe(new Transform({
    objectMode: true,
    transform: (response) => {
      // do something with the response
    },
  }))
  .pipe(somePlaceToSaveStuff);
```

## Usage

Extend the resolve class and provide a `_resolve` function.  This will be passed the `chunk` and `encoding` arguments from `stream._transform`.  It should return a `Promise`.  The return from this promise will be passed to the readable side of the stream.

Setting `maxParallel` option will control how many promises can run concurrently.

```js
class MyResolver extends Resolve {
  _resolve(chunk, encoding) {
  	 // Method should return a promise
  }
}
```

### `new Resolve({ resolve, maxParallel, maintainOrder })`

Creates a transform stream.  `objectMode` will default to true.  This can be overridden by setting `objectMode`, `readableObjectMode`, or `writableObjectMode`.

Arguments:

* **`resolve`** `<Function>` Implementation of the `Resolve._resolve` method.
* **`maxParallel`** `<Number>` Maximum number of promises to run concurrently.  Defaults to `1`.
* **`maintainOrder`** `<Boolean>` Should resolved promises be returned in the same order as they entered the stream.  Defaults to `true`.