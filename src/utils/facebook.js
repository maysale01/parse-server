"use strict";
require("babel-polyfill");

// Helper functions for accessing the Facebook Graph API.
import https from 'https';
import { Parse } from 'parse/node';

// Returns a promise that fulfills iff this user id is valid.
export function validateUserId(userId, access_token) {
    return graphRequest('me?fields=id&access_token=' + access_token)
    .then((data) => {
        if (data && data.id == userId) {
            return;
        }
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Facebook auth is invalid for this user.');
    });
}

// Returns a promise that fulfills iff this app id is valid.
export function validateAppId(appIds, access_token) {
    if (!appIds.length) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Facebook auth is not configured.');
    }
    return graphRequest('app?access_token=' + access_token)
    .then((data) => {
        if (data && appIds.indexOf(data.id) != -1) {
            return;
        }
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Facebook auth is invalid for this user.');
    });
}

// A promisey wrapper for FB graph requests.
export function graphRequest(path) {
    return new Promise((resolve, reject) => {
        https.get('https://graph.facebook.com/v2.5/' + path, (res) =>  {
            var data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () =>  {
                data = JSON.parse(data);
                resolve(data);
            });
        }).on('error', (e) =>  {
            reject('Failed to validate this access token with Facebook.');
        });
    });
}

export default {
    validateAppId: validateAppId,
    validateUserId: validateUserId
};
