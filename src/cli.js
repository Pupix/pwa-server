#!/usr/bin/env node

/* eslint-disable no-console */
const compression = require('compression');
const express = require('express');
const path = require('node:path');
const helmet = require('helmet');
const chalk = require('chalk');
const commander = require('commander');
const deepmerge = require('deepmerge');

const program = new commander.Command();

const pwa = require('./pwa');
const pkg = require('../package.json');

function parseOptionAsInt(value) {
    const parsedValue = parseInt(value, 10);

    if (Number.isNaN(parsedValue)) {
        throw new commander.InvalidArgumentError('Not a number.');
    }

    return parsedValue;
}

program
    .name(pkg.name)
    .description(pkg.description)
    .version(pkg.version, '-v, --version', 'Print the installed version.')
    .option('--host <host>', 'Listen on this hostname.', '127.0.0.1')
    .option('--port <port>', 'Listen on this port; 0 for random.', parseOptionAsInt, 8080)
    .option('--root <root>', 'Serve files relative to this directory.', '.')
    .option('--config <file>', 'JS/JSON configuration file.')
    .option('--cache-control <value>', 'The Cache-Control header to send for all requests except the entrypoint.', 'max-age=60')
    .option('--entrypoint <file>', 'The main entrypoint to your PWA for all routes.', 'index.html')
    .showHelpAfterError()
    .parse();

const args = program.opts();

let config = {
    host: args.host,
    port: args.port,
    root: args.root,
    cacheControl: args.cacheControl,
    entrypoint: args.entrypoint,
    helmet: {
        contentSecurityPolicy: false,
    },
};

if (args.config) {
    console.info(`Loading config from "${args.config}".`);
    // eslint-disable-next-line global-require, import/no-dynamic-require, security/detect-non-literal-require
    const fileConfig = require(path.resolve(args.config));
    config = deepmerge(config, fileConfig);
}

const app = express();

app.set('trust proxy', true);

app.use(compression());

if (config.helmet) {
    app.use(helmet(config.helmet));
}

console.info(`Serving files from "${path.resolve(config.root)}".`);
app.use(pwa.makeMiddleware(config));

const server = app.listen(config.port, config.host, () => {
    const addr = server.address();
    let urlHost = addr.address;

    if (addr.family === 'IPv6') {
        urlHost = `[${urlHost}]`;
    }

    console.log();
    console.log(chalk.hex('#FF8E14').bold('PWA Server'), 'listening');
    console.log(chalk.cyan(`http://${urlHost}:${addr.port}`));
    console.log();
});
