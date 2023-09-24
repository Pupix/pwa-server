# pwa-server

An HTTP server for Node designed to serve [Progressive Web Apps](https://web.dev/progressive-web-apps/) in production.

## Usage

### As a binary
```sh
$ npm install pwa-server
$ npx pwa-server --root .
```

```sh
Usage: pwa-server [options]

An HTTP server for Node designed to serve Progressive Web Apps in production

Options:
  -v, --version            Print the installed version.
  --host <host>            Listen on this hostname. (default: "127.0.0.1")
  --port <port>            Listen on this port; 0 for random. (default: 8080)
  --root <root>            Serve files relative to this directory. (default: ".")
  --config <file>          JS/JSON configuration file.
  --cache-control <value>  The Cache-Control header to send for all requests except the entrypoint. (default: "max-age=60")
  --entrypoint <file>      The main entrypoint to your PWA for all routes. (default: "index.html")
  -h, --help               Display this usage info
```

### As a library

```sh
$ npm install --save pwa-server
```

```js
const pwa = require('pwa-server');
const express = require('express');

const app = express();

app.get('/*', pwa.makeMiddleware(config));

app.listen(8080);
```

### Library API

#### makeMiddleware(config={})

Creates an Express middleware to handle a desired route as a Progressive Web App.

**expects:**

* `config`: the configuration of the middleware:
  * `config.root`: Path to the root of the project on the filesystem. This can be an absolute path, or a path relative to the current working directory. Defaults to the current working directory of the process.
  * `config.entrypoint`: The path relative to `root` of the entrypoint file that will be served. Usually this is index.html.<br>
  Default: `index.html`
  * `config.cacheControl`: The Cache-Control header to send for all requests except the entrypoint.<br>
  Default: `max-age=60`
  * `config.forwardErrors`: If `true`, when a 404 or other HTTP error occurs, the Express `next` function will be called with the error, so that it can be handled by downstream error handling middleware. If `false` (or if there was no `next` function because Express is not being used), a minimal `text/plain` error will be returned..<br>
  Default: `false`
  * `config.helmet`: Config options to pass downstream to [Helmet](https://helmetjs.github.io/#reference) <br>
  Default: `{
        contentSecurityPolicy: false
    }`.


## Entrypoint

In [Progressive Web Apps](https://web.dev/progressive-web-apps/), the *entrypoint* is a small HTML file that acts as the application bootstrap.

pwa-server will serve the entrypoint from `/`, and from any path that does not have a file extension and is not an existing file. By default it is `index.html`, or you can specify another name with the `entrypoint` configuration file setting.

Note that because the entrypoint is served from many URLs, and varies by user-agent, cache hits for the entrypoint will be minimal, so it should be kept as small as possible.

## Service Workers

### Scope header
pwa-server sets the [`Service-Worker-Allowed`](https://www.w3.org/TR/service-workers-1/#service-worker-allowed) header to `/` for any request with the `Service-Worker` header. This allows a service worker served from a subdirectory to be registered with a scope outside of that directory, e.g. `register('service-worker.js', { scope: '/' })`.

### 404 handling

pwa-server automatically serves a tiny self-unregistering service worker for any request with the `Service-Worker` header that would otherwise have had a `404 Not Found` response.

This can be useful when the location of a service worker has changed, as it will prevent clients from getting stuck with an old service worker indefinitely.

This problem arises because when a service worker updates, a `404` is treated as a failed update. It does not cause the service worker to be unregistered. See [w3c/ServiceWorker#204](https://github.com/w3c/ServiceWorker/issues/204) for more discussion of this problem.

## Caching

By default, pwa-server sets the [`Cache-Control`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control) header to `max-age=60` (1 minute), except for the entrypoint and service worker which gets `max-age=0`. [`ETag`](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/ETag) headers are also sent, so resources that have not changed on the server can be re-validated efficiently.

To change this default for non-entrypoint resources, set the `cacheControl` property in your configuration file, or the `--cache-control` command-line flag, to the desired `Cache-Control` header value. You may want to set `--cache-control=no-cache` during development.

For more advanced caching behavior, [use pwa-server as a library](#as-a-library) with Express and register a middleware that sets the `Cache-Control` header before registering the pwa-server middleware. If pwa-server sees that the `Cache-Control` header has already been set, it will not modify it. For example, to set year-long caching for images:

```js
app.get('/images/*', (req, res, next) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    next();
});

app.get('/*', pwa('.', config));
```

Choosing the right cache headers for your application can be complex. See [*Caching best practices & max-age gotchas*](https://jakearchibald.com/2016/caching-best-practices/) for one starting point.

## HTTP Errors

By default, if a `404 Not Found` or other HTTP server error occurs, pwa-server will serve a minimal `text/plain` response. To serve custom errors, [use pwa-server as a library](#as-a-library) with Express, set `forwardErrors: true` in your configuration object, and register an [error-handling middleware](http://expressjs.com/en/guide/error-handling.html) after registering the pwa-server handler:

```js
app.get('/*', pwa.makeMiddleware({
    forwardErrors: true
}));

app.use((error, req, res, next) => {
    if (error.status === 404) {
        res.status(404).sendFile('my-custom-404.html', { root: rootDir });
    } else {
        next();
    }
});
```