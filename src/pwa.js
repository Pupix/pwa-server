const fs = require('node:fs');
const httpErrors = require('http-errors');
const path = require('node:path');
const send = require('send');
const http = require('node:http');

// Matches URLs like "/foo/bar.png" but not "/foo.png/bar".
const hasFileExtension = /\.[^/]*$/;

function fileExists(filepath) {
    // eslint-disable-next-line no-promise-executor-return, security/detect-non-literal-fs-filename
    return new Promise((resolve) => fs.stat(filepath, (err) => resolve(!err)));
}

function writePlainTextError(response, error) {
    response.statusCode = error.status;
    response.setHeader('Content-Type', 'text/plain');
    response.end(error.message);
}

function isFileInRootDirectory(rootPath, filePath) {
    // Make sure the rootPath has a trailing slash so we don't expose
    // other directories. e.g. /foo would match the startsWith of /foo-secrets
    const trailedPath = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;
    return filePath.startsWith(trailedPath);
}

module.exports.makeMiddleware = function makeMiddleware(config) {
    const absRoot = path.resolve(config?.root || '.');
    const cacheControl = config?.cacheControl || 'max-age=60';
    const forwardErrors = config?.forwardErrors;
    const entrypoint = config?.entrypoint || 'index.html';

    return async function pwaMiddleware(request, response, next) {
        const handleError = (error) => {
            if (forwardErrors && next) {
                next(error);
            } else {
                writePlainTextError(response, error);
            }
        };

        const urlPath = request.url || '/';

        // Avoid directory traversal before doing file operations
        const absFilepath = path.normalize(path.join(absRoot, urlPath));
        if (!isFileInRootDirectory(absRoot, absFilepath)) {
            handleError(httpErrors(403, 'Forbidden'));
            return;
        }

        const isFile = hasFileExtension.test(urlPath);
        const serveServiceWorker = !!request.headers['service-worker'];
        const serveEntrypoint = urlPath === '/'
            || (!isFile && !serveServiceWorker && !(await fileExists(absFilepath)));

        let fileToSend = serveEntrypoint ? entrypoint : urlPath;

        if (serveServiceWorker) {
            // https://www.w3.org/TR/service-workers-1/#service-worker-allowed
            response.setHeader('Service-Worker-Allowed', '/');

            // Unregister dead service workers.
            if (!(await fileExists(absFilepath))) {
                fileToSend = path.normalize(path.relative(absRoot, path.resolve(__dirname, 'self-destructing-sw.js')));
            }
        }

        // Don't set the Cache-Control header if it's already set
        if (!response.getHeader('Cache-Control')) {
            response.setHeader('Cache-Control', (serveEntrypoint || serveServiceWorker) ? 'max-age=0' : cacheControl);
        }

        const sendOpts = {
            root: absRoot,
            // We set the cache manually based on resource type
            cacheControl: false,
        };

        send(request, fileToSend, sendOpts).on('error', (error) => {
            // Replace verbose error message with a generic one to avoid leaking system paths
            // eslint-disable-next-line no-param-reassign
            error.message = http.STATUS_CODES[error.status] || String(error.status);
            handleError(error);
        }).pipe(response);
    };
};
