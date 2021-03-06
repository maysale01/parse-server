"use strict";
require("babel-polyfill");

import { Parse } from 'parse/node';

export default function handleParseErrors(err, req, res, next) {
    try {
        if (err instanceof Parse.Error) {
            var httpStatus;

        // TODO: fill out this mapping
        switch (err.code) {
            case Parse.Error.INTERNAL_SERVER_ERROR:
                httpStatus = 500;
                break;
            case Parse.Error.OBJECT_NOT_FOUND:
                httpStatus = 404;
                break;
            default:
                httpStatus = 400;
            }

            res.status(httpStatus);
            res.json({code: err.code, error: err.message});
        } else {
            console.error('Uncaught internal server error.', err, err.stack);
            res.status(500);
            res.json({code: Parse.Error.INTERNAL_SERVER_ERROR, message: 'Internal server error.'});
        }
    } catch(e) {
        console.error(e, e.stack);
    }
};