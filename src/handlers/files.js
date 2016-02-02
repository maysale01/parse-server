// files.js

import express from 'express';
import bodyParser from 'body-parser';
import mime from 'mime';
import { Parse } from 'parse/node';
import { rack } from 'hat';
import { Config } from '../classes';
import * as middlewares from '../middlewares';

const router = express.Router();

function processCreate(req, res, next) {
    const Server = req.Parse.Server;

    if (!req.body || !req.body.length) {
        next(new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'Invalid file upload.'));
        return;
    }

    if (req.params.filename.length > 128) {
        next(new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename too long.'));
        return;
    }

    if (!req.params.filename.match(/^[_a-zA-Z0-9][a-zA-Z0-9@\.\ ~_-]*$/)) {
        next(new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename contains invalid characters.'));
        return;
    }

    // If a content-type is included, we'll add an extension so we can
    // return the same content-type.
    let extension = '';
    let hasExtension = req.params.filename.indexOf('.') > 0;
    let contentType = req.get('Content-type');
    if (!hasExtension && contentType && mime.extension(contentType)) {
        extension = '.' + mime.extension(contentType);
    }

    let filename = rack() + '_' + req.params.filename + extension;

    Server
    .getFilesProvider()
    .getAdapter()
    .create(req.config, filename, req.body)
    .then(() => {
        res.status(201);
        let location = req.Parse.server.getFilesProvider().getAdapter().location(req.config, req, filename);
        res.set('Location', location);
        res.json({ url: location, name: filename });
    }).catch((error) => {
        next(new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'Could not store file.'));
    });
};

function processGet(req, res) {
    const Server = req.Parse.Server;
    const config = new Config(req.params.appId);

    Server
    .getFilesProvider()
    .getAdapter()
    .get(config, req.params.filename)
    .then((data) => {
        res.status(200);
        let contentType = mime.lookup(req.params.filename);
        res.set('Content-type', contentType);
        res.end(data);
    }).catch((error) => {
        res.status(404);
        res.set('Content-type', 'text/plain');
        res.end('File not found.');
    });
};

// Handle file retrieval
router.get('/files/:appId/:filename', processGet);

// Handle a post to files without the filename parameter
router.post('/files', function(req, res, next) {
    next(new Parse.Error(Parse.Error.INVALID_FILE_NAME, 'Filename not provided.'));
});

// TODO: do we need to allow crossdomain and method override?
router.post(
    '/files/:filename',
    bodyParser.raw({type: '*/*', limit: '20mb'}),
    middlewares.handleParseHeaders,
    processCreate
);

export default router;