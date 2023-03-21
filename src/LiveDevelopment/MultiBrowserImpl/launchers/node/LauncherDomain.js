/*
 * Copyright (c) 2014 - present Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*eslint-env node */
/*jslint node: true */
"use strict";

var path = require('path');
var childProcess = require('child_process');
var objectAssign = require('object-assign');
var Promise = require('pinkie-promise');

function open(target, opts) {
    if (typeof target !== 'string') {
        return Promise.reject(new Error('Expected a `target`'));
    }

    opts = objectAssign({wait: true}, opts);

    var cmd;
    var appArgs = [];
    var args = [];
    var cpOpts = {};

    if (Array.isArray(opts.app)) {
        appArgs = opts.app.slice(1);
        opts.app = opts.app[0];
    }

    if (process.platform === 'darwin') {
        cmd = 'open';

        if (opts.wait) {
            args.push('-W');
        }

        if (opts.app) {
            args.push('-n');
            args.push('-a', opts.app);
        }
    } else if (process.platform === 'win32') {
        cmd = 'cmd';
        args.push('/c', 'start', '""');
        target = target.replace(/&/g, '^&');

        if (opts.wait) {
            args.push('/wait');
        }

        if (opts.app) {
            args.push(opts.app);
        }

        if (appArgs.length > 0) {
            args = args.concat(appArgs);
        }
        cpOpts.shell = true;
    } else {
        if (opts.app) {
            cmd = opts.app;
        } else {
            cmd = path.join(__dirname, 'xdg-open');
        }

        if (appArgs.length > 0) {
            args = args.concat(appArgs);
        }

        if (!opts.wait) {
            // xdg-open will block the process unless
            // stdio is ignored even if it's unref'd
            cpOpts.stdio = 'ignore';
        }
    }

    args.push(target);

    if (process.platform === 'darwin' && appArgs.length > 0) {
        args.push('--args');
        args = args.concat(appArgs);
    }

    var cp = childProcess.spawn(cmd, args, cpOpts);

    if (opts.wait) {
        return new Promise(function (resolve, reject) {
            cp.once('error', reject);

            cp.once('close', function (code) {
                if (code > 0) {
                    reject(new Error('Exited with code ' + code));
                    return;
                }

                resolve(cp);
            });
        });
    }

    cp.unref();

    return Promise.resolve(cp);
};


/**
 * @private
 * The Brackets domain manager for registering node extensions.
 * @type {?DomainManager}
 */
var _domainManager;

/**
 * Launch the given URL in the system default browser.
    * TODO: it now launching just on default browser, add launchers for specific browsers.
 * @param {string} url
 */
function _cmdLaunch(url) {
    open(url);
}

function _launchChromeWithRDP(url, enableRemoteDebugging) {
    if (process.platform === 'darwin') {
        open(url, {app: ['Google Chrome',
                "--disk-cache-size=250000000",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-default-apps",
                "--allow-file-access-from-files",
                "--remote-debugging-port=9222",
                "--user-data-dir=/tmp/BracketsChromeProfile",
                "--remote-allow-origins=*"
            ]});
        return;
    }
    open(url, {app: ['chrome',
            "--disk-cache-size=250000000",
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-default-apps",
            "--allow-file-access-from-files",
            "--remote-debugging-port=9222",
            '--user-data-dir="%appdata%/BracketsChromeProfile"',
            "--remote-allow-origins=*"
        ]});
}

/**
 * Initializes the domain and registers commands.
 * @param {DomainManager} domainManager The DomainManager for the server
 */
function init(domainManager) {
    _domainManager = domainManager;
    if (!domainManager.hasDomain("launcher")) {
        domainManager.registerDomain("launcher", {major: 0, minor: 1});
    }
    domainManager.registerCommand(
        "launcher",      // domain name
        "launch",       // command name
        _cmdLaunch,     // command handler function
        false,          // this command is synchronous in Node
        "Launches a given HTML file in the browser for live development",
        [
            { name: "url", type: "string", description: "file:// url to the HTML file" },
            { name: "browser", type: "string", description: "browser name"}
        ],
        []
    );

    domainManager.registerCommand(
        "launcher",      // domain name
        "launchChromeWithRDP",       // command name
        _launchChromeWithRDP,     // command handler function
        false,          // this command is synchronous in Node
        "Launches a given HTML file in the browser for live development",
        [
            { name: "url", type: "string", description: "file:// url to the HTML file" },
            { name: "enableRemoteDebugging", type: "string", description: "enable remote debugging or not"}
        ],
        []
    );
}

exports.init = init;
